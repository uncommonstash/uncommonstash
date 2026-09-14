#!/usr/bin/env python3
"""Export the uncommonstash/cronformer checkpoint for browser inference.

The upstream checkpoint ships PyTorch custom-model code. This wrapper exposes
only the structured logits consumed by the browser decoder so it can be run by
onnxruntime-web without an inference endpoint.

The pinned source revision and output checksum live in
public/models/cronformer/manifest.json.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

import torch


COMPONENTS = ("minute", "hour", "dom", "month", "dow")
LOGITS = (
    "pattern_logits",
    "values_logits",
    "range_start_logits",
    "range_end_logits",
    "step_start_logits",
    "step_size_logits",
    "nth_logits",
    "last_offset_logits",
    "value_count_logits",
    "list_values_logits",
)


class BrowserCronformer(torch.nn.Module):
    """Flatten Cronformer's custom output object into stable ONNX tensors."""

    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
    ) -> tuple[torch.Tensor, ...]:
        output = self.model(input_ids=input_ids, attention_mask=attention_mask)
        tensors = []
        for component_name in COMPONENTS:
            component = output.get_component(component_name)
            tensors.extend(getattr(component, name) for name in LOGITS)
        tensors.append(output.dom_dow_intersect_logits)
        return tuple(tensors)


def load_model(model_dir: Path) -> torch.nn.Module:
    package_name = "cronformer_export_source"
    spec = importlib.util.spec_from_file_location(
        package_name,
        model_dir / "__init__.py",
        submodule_search_locations=[str(model_dir)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load Cronformer code from {model_dir}")
    package = importlib.util.module_from_spec(spec)
    sys.modules[package_name] = package
    spec.loader.exec_module(package)
    module = __import__(f"{package_name}.modeling_cronformer", fromlist=["CronformerModel"])
    return module.CronformerModel.from_pretrained(model_dir).eval()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    model = BrowserCronformer(load_model(args.model_dir))
    sample = torch.zeros((1, 128), dtype=torch.long)
    names = [f"{component}_{logit.removesuffix('_logits')}" for component in COMPONENTS for logit in LOGITS]
    names.append("dom_dow_intersect")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (sample, sample),
        args.output,
        input_names=["input_ids", "attention_mask"],
        output_names=names,
        opset_version=17,
        dynamo=False,
    )


if __name__ == "__main__":
    main()
