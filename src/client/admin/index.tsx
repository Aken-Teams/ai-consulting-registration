import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import './admin.css';

const root = createRoot(document.getElementById('admin-root')!);
root.render(<AdminApp />);
