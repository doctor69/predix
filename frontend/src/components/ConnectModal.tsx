import { useEffect } from 'react';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

const trustFacts = [
  {
    icon: '🔒',
    title: 'Zero Custody',
    body: 'Your USDC is held by a smart contract — not us. No one can touch your funds.',
  },
  {
    icon: '📋',
    title: 'Fully On-Chain',
    body: 'Every bet, resolution, and payout is recorded on Polygon. Verify anything publicly.',
  },
  {
    icon: '⚡',
    title: 'Instant Payouts',
    body: 'Winnings release automatically after a 2-hour dispute window. No manual processing.',
  },
];

export function ConnectModal({ isOpen, onClose, onConnect }: ConnectModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = () => {
    onConnect();
    onClose();
  };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal card — always light theme */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        style={{ background: '#ffffff' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:text-white transition-colors hover:bg-white/20"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.854 3.146a.5.5 0 0 1 0 .708L8.707 8l4.147 4.146a.5.5 0 0 1-.708.708L8 8.707l-4.146 4.147a.5.5 0 0 1-.708-.708L7.293 8 3.146 3.854a.5.5 0 0 1 .708-.708L8 7.293l4.146-4.147a.5.5 0 0 1 .708 0z" />
          </svg>
        </button>

        {/* Gradient header */}
        <div
          className="px-6 py-8 text-white"
          style={{ background: 'linear-gradient(135deg, #1652f0 0%, #4285f4 100%)' }}
        >
          <div className="mb-1 flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              📈
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Predix
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold">Welcome to Predix</h2>
          <p className="mt-1 text-white/80 text-sm">The transparent prediction market</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5" style={{ background: '#ffffff' }}>
          <p className="mb-3 text-sm font-semibold" style={{ color: '#0d1421' }}>
            Why traders trust Predix
          </p>

          {/* Trust fact cards */}
          <div className="flex flex-col gap-3 mb-5">
            {trustFacts.map((fact) => (
              <div
                key={fact.title}
                className="flex items-start gap-3 rounded-xl p-4"
                style={{ background: '#e8f0fe' }}
              >
                <span className="text-xl leading-none mt-0.5">{fact.icon}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0d1421' }}>
                    {fact.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: '#4a5568' }}>
                    {fact.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Stat line */}
          <p className="mb-5 text-center text-xs" style={{ color: '#8892a4' }}>
            Secured by smart contract · Polygon network · 2% fee only on losses
          </p>

          {/* CTA */}
          <button
            onClick={handleConnect}
            className="w-full rounded-xl py-3 text-sm font-bold text-white transition-colors"
            style={{ background: '#1652f0' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#0e3bbf';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#1652f0';
            }}
          >
            Connect Wallet
          </button>

          <p className="mt-3 text-center text-xs" style={{ color: '#8892a4' }}>
            By connecting you agree to our{' '}
            <span
              className="underline cursor-pointer"
              style={{ color: '#1652f0' }}
            >
              Terms of Service
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
