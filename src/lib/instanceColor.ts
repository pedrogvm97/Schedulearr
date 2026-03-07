/**
 * Converts a stored instance color (Tailwind class or hex) to a hex color string.
 * Colors are stored in the DB as Tailwind bg-* class names from the settings color picker.
 */
export function twColorToHex(color: string | undefined | null): string {
    if (!color) return '#3b82f6';
    if (color.startsWith('#')) return color;
    if (color.includes('slate')) return '#64748b';
    if (color.includes('gray')) return '#6b7280';
    if (color.includes('zinc')) return '#71717a';
    if (color.includes('neutral')) return '#737373';
    if (color.includes('stone')) return '#78716c';
    if (color.includes('red')) return '#ef4444';
    if (color.includes('orange')) return '#f97316';
    if (color.includes('amber')) return '#f59e0b';
    if (color.includes('yellow')) return '#eab308';
    if (color.includes('lime')) return '#84cc16';
    if (color.includes('green')) return '#22c55e';
    if (color.includes('emerald')) return '#10b981';
    if (color.includes('teal')) return '#14b8a6';
    if (color.includes('cyan')) return '#06b6d4';
    if (color.includes('sky')) return '#0ea5e9';
    if (color.includes('blue')) return '#3b82f6';
    if (color.includes('indigo')) return '#6366f1';
    if (color.includes('violet')) return '#8b5cf6';
    if (color.includes('purple')) return '#a855f7';
    if (color.includes('fuchsia')) return '#d946ef';
    if (color.includes('pink')) return '#ec4899';
    if (color.includes('rose')) return '#f43f5e';
    return '#3b82f6';
}
