export const metadata = {
  title: 'Nada Gurukulam — Music & Performing Arts Academy',
  description: 'Free Classical Performing Arts Education under Sadguru Sri Madhusudan Sai.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
