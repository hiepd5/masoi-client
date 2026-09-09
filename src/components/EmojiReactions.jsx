import { useState } from 'react';

const EMOJIS = ['😱', '🤔', '🐺', '👍', '❓', '😂'];

export default function EmojiReactions({ socketRef, myName }) {
  const [cooldown, setCooldown] = useState(false);

  function sendReaction(emoji) {
    if (cooldown) return;
    socketRef.current?.emit('reaction', { emoji, name: myName });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 3000);
  }

  return (
    <div className="emoji-reactions">
      {EMOJIS.map(e => (
        <button
          key={e}
          className={`emoji-btn ${cooldown ? 'cooldown' : ''}`}
          onClick={() => sendReaction(e)}
          title={cooldown ? 'Chờ 3 giây...' : 'Phản ứng'}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
