import React from 'react';
import { render } from '@testing-library/react';
import { ImageToPdf } from './image-to-pdf';

describe('ImageToPdf', () => {
  it('renders without crashing', () => {
    render(<ImageToPdf />);
  });
});
