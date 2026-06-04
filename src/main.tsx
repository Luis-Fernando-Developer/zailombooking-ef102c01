import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
console.log('CSS imported');

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
