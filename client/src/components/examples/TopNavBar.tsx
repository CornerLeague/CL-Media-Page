import { TopNavBar } from '../TopNavBar';
import { ThemeProvider } from '../ThemeProvider';

export default function TopNavBarExample() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TopNavBar />
    </ThemeProvider>
  );
}
