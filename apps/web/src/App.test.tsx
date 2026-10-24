import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App.tsx';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('EventPilot')).toBeInTheDocument();
  });

  it('has a skip link for keyboard navigation', () => {
    render(<App />);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('has a main content landmark', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
