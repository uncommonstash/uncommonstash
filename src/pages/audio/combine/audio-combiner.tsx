import { GripVertical, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "react-beautiful-dnd";
import {
  ConverterLayout,
  InputPanel,
  OutputPanel,
} from "@/components/converter/layout";
import {
  EmptyState,
  FileSelector,
  Header,
  OutputHeader,
  ResultItem,
} from "@/components/converter/ui";
import { Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { csr } from "@/lib/compat";
import { combineAudio } from "@/lib/ffmpeg";

export function AudioCombiner() {
  const [files, setFiles] = useState<File[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable per-file identity for React keys and draggableIds. Index-derived
  // ids break on reorder (the id follows the position, not the file), so ids
  // are minted once per File object and pinned in a ref.
  const fileIds = useRef(new Map<File, string>());
  const idForFile = (file: File) => {
    let id = fileIds.current.get(file);
    if (!id) {
      id = `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
      fileIds.current.set(file, id);
    }
    return id;
  };

  const handleCombine = async () => {
    if (files.length < 2) return;
    setLoading(true);
    try {
      const outputBlob = await combineAudio(files);
      const url = URL.createObjectURL(outputBlob);
      setOutputUrl(url);
    } catch (error) {
      console.error("Failed to combine audio:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    setOutputUrl(null);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(files);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setFiles(items);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setOutputUrl(null);
  };

  return (
    <div className="h-full bg-background">
      <ConverterLayout>
        <InputPanel show={!outputUrl}>
          <Header
            title="Audio Combiner"
            description="Upload and merge multiple audio files into a single track. Drag to reorder."
          />

          <div className="flex flex-col gap-6 w-full py-2 flex-1 overflow-hidden">
            <FileSelector
              files={[]} // We handle our own list for reordering
              onFilesSelected={handleFilesSelected}
              onRemoveFile={() => {}}
              accept="audio/*"
              label="Add Audio Files"
              disabled={loading}
              multiple={true}
            />

            {files.length > 0 && (
              <div className="flex-1 flex flex-col min-h-0 basis-0 overflow-hidden">
                <label className="text-sm font-medium text-foreground mb-2">
                  Files to Merge ({files.length})
                </label>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="audio-files">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-2"
                        >
                          {files.map((file, index) => (
                            <Draggable
                              key={idForFile(file)}
                              draggableId={idForFile(file)}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex items-center gap-3 p-3 bg-muted/40 border rounded-lg group transition-all ${
                                    snapshot.isDragging
                                      ? "bg-muted shadow-md border-primary/50"
                                      : "hover:bg-muted/60"
                                  }`}
                                >
                                  <div
                                    {...provided.dragHandleProps}
                                    className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {file.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {(file.size / (1024 * 1024)).toFixed(2)}{" "}
                                      MB
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeFile(index)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <Button
              onClick={handleCombine}
              disabled={loading || files.length < 2}
              size="lg"
              className="w-full sm:w-auto min-w-[140px]"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Combining...
                </>
              ) : (
                "Combine Audio"
              )}
            </Button>
          </div>
        </InputPanel>

        <OutputPanel show={!!outputUrl}>
          <OutputHeader
            count={outputUrl ? 1 : 0}
            onClear={() => setOutputUrl(null)}
            title="Combined Results"
          />

          {outputUrl ? (
            <div className="max-w-md">
              <ResultItem url={outputUrl} name="combined.mp3" type="audio" />
            </div>
          ) : (
            <EmptyState
              title="No processed files"
              description="Upload files on the left and click combine to see the results here."
            />
          )}
        </OutputPanel>
      </ConverterLayout>
    </div>
  );
}

export default csr(AudioCombiner);
