import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { UserDirectoryTable } from './UserDirectoryTable';

const teacher = { id: 'u1', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', role: 'TEACHER', accountStatus: 'APPROVED', _count: {} };
const blocked = { ...teacher, id: 'u2', firstName: 'Ravi', lastName: 'Kumar', accountStatus: 'BLOCKED' };

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('UserDirectoryTable: deleting and blocking', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockReset();
    refresh.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderTable = () => render(<UserDirectoryTable users={[teacher, blocked]} searchQuery="" onSearchChange={() => {}} />);

  it('explains a refused delete and blocks the account from there instead', async () => {
    const message = 'Asha Rao cannot be deleted: they have 120 questions authored. Block the account instead: it stops them signing in and keeps their records.';
    fetchMock.mockImplementationOnce(() => json(409, { error: message, code: 'USER_HAS_RECORDS', canBlock: true }));
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Asha Rao' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('120 questions authored');
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/u1', { method: 'DELETE' });

    fetchMock.mockImplementationOnce(() => json(200, { success: true }));
    fireEvent.click(within(alert).getByRole('button', { name: 'Block Asha Rao' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/users', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ userId: 'u1', action: 'BLOCK' }) })));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it('offers unblock for a blocked account', async () => {
    fetchMock.mockImplementationOnce(() => json(200, { success: true }));
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Unblock Ravi Kumar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ body: JSON.stringify({ userId: 'u2', action: 'UNBLOCK' }) })));
  });

  it('does nothing when the admin cancels', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Asha Rao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Asha Rao' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
