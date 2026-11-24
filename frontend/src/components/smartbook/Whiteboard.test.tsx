import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Whiteboard from './Whiteboard';

// jsdom has no canvas drawing; the board's strokes are what matter here.
beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const board = () => screen.getByTestId('whiteboard');
const canvas = () => screen.getByTestId('whiteboard-canvas');
const scribble = (x = 10, y = 10) => {
  fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, pointerId: 1, button: 0 });
  fireEvent.pointerMove(canvas(), { clientX: x + 20, clientY: y + 5, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { pointerId: 1 });
};

describe('Whiteboard', () => {
  it('opens blank, and keeps each stroke written on it', () => {
    render(<Whiteboard storageKey="t:board" />);
    expect(board()).toHaveAttribute('data-strokes', '0');
    expect(screen.getByText('Write or work here')).toBeInTheDocument();
    scribble();
    scribble(40, 40);
    expect(board()).toHaveAttribute('data-strokes', '2');
    expect(screen.queryByText('Write or work here')).toBeNull();
  });

  it('undoes and redoes a stroke, and brings a cleared sheet back with undo', () => {
    render(<Whiteboard storageKey="t:board" />);
    scribble();
    scribble();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(board()).toHaveAttribute('data-strokes', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(board()).toHaveAttribute('data-strokes', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Clear this sheet' }));
    expect(board()).toHaveAttribute('data-strokes', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(board()).toHaveAttribute('data-strokes', '2');
  });

  it('keeps several sheets, each with its own working', () => {
    render(<Whiteboard storageKey="t:board" />);
    scribble();
    fireEvent.click(screen.getByRole('button', { name: /New sheet/ }));
    expect(screen.getByTestId('whiteboard-sheet')).toHaveTextContent('Sheet 2 of 2');
    expect(board()).toHaveAttribute('data-strokes', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Previous sheet' }));
    expect(screen.getByTestId('whiteboard-sheet')).toHaveTextContent('Sheet 1 of 2');
    expect(board()).toHaveAttribute('data-strokes', '1');
  });

  it('keeps the working on this device, so it is there again after a reload', async () => {
    const first = render(<Whiteboard storageKey="t:board" />);
    scribble();
    await waitFor(() => expect(window.localStorage.getItem('t:board')).toContain('"sheets"'));
    first.unmount();
    render(<Whiteboard storageKey="t:board" />);
    expect(board()).toHaveAttribute('data-strokes', '1');
  });

  it("keeps each exercise's board apart", async () => {
    const first = render(<Whiteboard storageKey="t:a:board" />);
    scribble();
    await waitFor(() => expect(window.localStorage.getItem('t:a:board')).toContain('"sheets"'));
    first.unmount();
    render(<Whiteboard storageKey="t:b:board" />);
    expect(board()).toHaveAttribute('data-strokes', '0');
  });

  it('ignores a saved board it cannot read', () => {
    window.localStorage.setItem('t:board', '{not json');
    render(<Whiteboard storageKey="t:board" />);
    expect(board()).toHaveAttribute('data-strokes', '0');
  });
});
