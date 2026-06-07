import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterPanel } from '../../components/FilterPanel.js';
// Stub fetch so UserPicker inside FilterPanel doesn't hit the network
const NO_USERS = [];
beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(NO_USERS),
    }));
});
function buildProps(overrides) {
    return {
        selectedUsers: [],
        selectedRepoTargets: [],
        selectedProjects: [],
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        isLoading: false,
        savedSession: null,
        onUsersChange: vi.fn(),
        onRepoTargetsChange: vi.fn(),
        onProjectsChange: vi.fn(),
        onStartChange: vi.fn(),
        onEndChange: vi.fn(),
        onPreset: vi.fn(),
        onSubmit: vi.fn(),
        onRestoreSession: vi.fn(),
        onDismissSession: vi.fn(),
        ...overrides,
    };
}
describe('Run Report button (REQ-4.1-5)', () => {
    // @req REQ-4.1-5
    it('is disabled when no users are selected', async () => {
        render(_jsx(FilterPanel, { ...buildProps({ selectedUsers: [] }) }));
        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /run report/i });
            expect(btn).toBeDisabled();
        });
    });
    // @req REQ-4.1-5
    it('is enabled when at least one user is selected', async () => {
        render(_jsx(FilterPanel, { ...buildProps({ selectedUsers: ['alice'] }) }));
        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /run report/i });
            expect(btn).not.toBeDisabled();
        });
    });
    // @req REQ-4.1-5
    it('is disabled while loading even when users are selected', async () => {
        render(_jsx(FilterPanel, { ...buildProps({ selectedUsers: ['alice'], isLoading: true }) }));
        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /loading/i });
            expect(btn).toBeDisabled();
        });
    });
    // @req REQ-4.1-5
    it('calls onSubmit when clicked and enabled', async () => {
        const onSubmit = vi.fn();
        render(_jsx(FilterPanel, { ...buildProps({ selectedUsers: ['alice'], onSubmit }) }));
        await waitFor(() => screen.getByRole('button', { name: /run report/i }));
        await userEvent.click(screen.getByRole('button', { name: /run report/i }));
        expect(onSubmit).toHaveBeenCalledOnce();
    });
});
