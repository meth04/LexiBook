import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { App } from '../../src/app/App';
import { lexiBookClient, setLexiBookBackend } from '../../src/shared/api/client';

describe('Task 01 — Bootstrap shell & typed IPC contract', () => {
  it('renders Vietnamese navigation shell routes', () => {
    render(React.createElement(App));
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thư viện' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đọc sách' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ vựng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ôn tập' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiến độ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeInTheDocument();
  });

  it('returns typed Result error when backend bridge is not connected', async () => {
    setLexiBookBackend(null);
    const res = await lexiBookClient.listBooks();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INTERNAL_ERROR');
      expect(res.error.messageVi).toBeTruthy();
    }
  });
});
