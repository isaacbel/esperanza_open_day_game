import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HAND CATCH — AI Webcam Hand-Tracking Arcade Game',
  description:
    'Use your real hands to catch falling neon columns. AI hand-tracking in the browser with MediaPipe. No downloads required.',
  keywords: ['hand tracking', 'arcade game', 'webcam game', 'MediaPipe', 'AI game'],
  authors: [{ name: 'HAND CATCH' }],
  robots: 'index, follow',
  openGraph: {
    title: 'HAND CATCH',
    description: 'Use your real hands to catch falling neon columns powered by AI.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#030612',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
