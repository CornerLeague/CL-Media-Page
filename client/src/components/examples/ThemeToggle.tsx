import { ThemeToggle } from '../ThemeToggle';
import { ThemeProvider } from '../ThemeProvider';

export default function ThemeToggleExample() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="p-4">
        <ThemeToggle />
      </div>
    </ThemeProvider>
  );
}
