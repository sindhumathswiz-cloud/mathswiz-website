import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import BookReader from './BookReader';

const chapters = [
  { id: 'c1', name: 'Relations and Functions', chapterNumber: '1', startPage: 3 },
  { id: 'c2', name: 'Matrices', chapterNumber: '2', startPage: 6 },
];
const renderReader = (extra = {}) => render(
  <BookReader bookId="b1" title="Xam Idea Mathematics" subtitle="Class 12" backHref="/student/smartbook" backLabel="My Books"
    pages={[1, 2, 3, 4, 5, 6, 7, 8]} chapters={chapters} pageAspect={1.35} pageImageBase="/api/student/smartbook/b1/pages" storageKey="book:s1:b1" {...extra} />,
);

describe('BookReader', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('shows every page of the book one below another, with a blank whiteboard beside it', () => {
    renderReader();
    const pages = within(screen.getByTestId('reader-pages')).getAllByRole('img');
    expect(pages.map((img) => img.getAttribute('src'))).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((p) => `/api/student/smartbook/b1/pages/${p}`));
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 1');
    expect(screen.getByTestId('reader-page')).toHaveTextContent('1 of 8');
    expect(screen.getByTestId('whiteboard')).toHaveAttribute('data-strokes', '0');
  });

  it('jumps to a chapter, and to a page typed in', () => {
    renderReader();
    fireEvent.change(screen.getByTestId('reader-chapter'), { target: { value: 'c2' } });
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 6');
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Matrices');
    fireEvent.change(screen.getByTestId('reader-goto'), { target: { value: '4' } });
    fireEvent.submit(screen.getByTestId('reader-goto'));
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 4');
    expect(screen.getByTestId('reader-chapter')).toHaveValue('c1');
  });

  it('reopens where the book was left on this device, unless a page is asked for', () => {
    window.localStorage.setItem('book:s1:b1:page', '7');
    const first = renderReader();
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 7');
    first.unmount();
    renderReader({ initialPage: 5 });
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 5');
  });

  it('hides and shows the whiteboard', () => {
    renderReader();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the whiteboard' }));
    expect(screen.queryByTestId('whiteboard')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show the whiteboard' }));
    expect(screen.getByTestId('whiteboard')).toBeInTheDocument();
  });
});
