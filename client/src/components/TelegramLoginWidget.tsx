import { useEffect, useRef } from 'react';

interface TelegramLoginWidgetProps {
  botName: string;
  onAuth: (user: any) => void;
}

export default function TelegramLoginWidget({ botName, onAuth }: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!botName || !containerRef.current) return;

    // Define the global callback function that Telegram will call
    (window as any).onTelegramAuth = (user: any) => {
      onAuth(user);
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(script);

    return () => {
      // Cleanup global callback
      delete (window as any).onTelegramAuth;
    };
  }, [botName, onAuth]);

  return <div ref={containerRef} className="flex justify-center" />;
}