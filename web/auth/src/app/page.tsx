'use client';


export default function Home() {
  const start = () => {
    const url = '/api/auth/google/start?src=web';
    window.location.href = url;
  };
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
      <button onClick={start} style={{ padding: '12px 20px', fontSize: 16 }}>
        Sign in with Google
      </button>
    </main>
  );
}