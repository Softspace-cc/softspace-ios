// Parse @role mentions from message content against a server's role list.

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns role IDs mentioned in content. Matches @everyone for the default role
 * and @RoleName for other roles (supports names with spaces).
 */
export function parseRoleMentions(content, roles) {
  if (!content || !roles?.length) return [];

  const mentionedIds = [];
  const used = new Set();

  const patterns = roles
    .map((role) => ({
      role,
      token: role.isDefault ? '@everyone' : `@${role.name}`,
    }))
    .sort((a, b) => b.token.length - a.token.length);

  const lowerContent = content.toLowerCase();

  for (const { role, token } of patterns) {
    const lowerToken = token.toLowerCase();
    let idx = 0;
    while ((idx = lowerContent.indexOf(lowerToken, idx)) !== -1) {
      const beforeChar = idx > 0 ? content[idx - 1] : ' ';
      if (beforeChar !== ' ' && beforeChar !== '\n' && idx !== 0) {
        idx++;
        continue;
      }
      const after = idx + token.length;
      const afterChar = after < content.length ? content[after] : ' ';
      if (
        afterChar !== ' ' &&
        afterChar !== '\n' &&
        afterChar !== '@' &&
        after !== content.length
      ) {
        idx++;
        continue;
      }
      if (!used.has(role.id)) {
        mentionedIds.push(role.id);
        used.add(role.id);
      }
      idx = after;
    }
  }

  return mentionedIds;
}

export function stringifyMentionedRoleIds(ids) {
  if (!ids?.length) return null;
  return JSON.stringify(ids);
}

export function parseMentionedRoleIds(stored) {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Split message content into text and mention segments for client-style rendering. */
export function splitMentionSegments(content, roles) {
  if (!content) return [{ type: 'text', value: '' }];
  if (!roles?.length) return [{ type: 'text', value: content }];

  const patterns = roles
    .flatMap((role) => {
      const tokens = role.isDefault ? ['@everyone'] : [`@${role.name}`];
      return tokens.map((token) => ({
        role,
        token,
        regex: new RegExp(escapeRegex(token), 'gi'),
      }));
    })
    .sort((a, b) => b.token.length - a.token.length);

  const segments = [];
  let remaining = content;

  while (remaining.length > 0) {
    let earliest = null;
    for (const p of patterns) {
      p.regex.lastIndex = 0;
      const match = p.regex.exec(remaining);
      if (!match) continue;
      const beforeChar = match.index > 0 ? remaining[match.index - 1] : ' ';
      if (beforeChar !== ' ' && beforeChar !== '\n' && match.index !== 0) continue;
      const after = match.index + match[0].length;
      const afterChar = after < remaining.length ? remaining[after] : ' ';
      if (
        afterChar !== ' ' &&
        afterChar !== '\n' &&
        afterChar !== '@' &&
        after !== remaining.length
      ) {
        continue;
      }
      if (!earliest || match.index < earliest.index) {
        earliest = { index: match.index, length: match[0].length, role: p.role, token: match[0] };
      }
    }

    if (!earliest) {
      segments.push({ type: 'text', value: remaining });
      break;
    }

    if (earliest.index > 0) {
      segments.push({ type: 'text', value: remaining.slice(0, earliest.index) });
    }
    segments.push({ type: 'mention', value: earliest.token, role: earliest.role });
    remaining = remaining.slice(earliest.index + earliest.length);
  }

  return segments.length ? segments : [{ type: 'text', value: content }];
}
