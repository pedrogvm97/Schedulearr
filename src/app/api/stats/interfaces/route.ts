
import { NextResponse } from 'next/server';
import fs from 'fs';

export async function GET() {
    try {
        if (!fs.existsSync('/proc/net/dev')) {
            return NextResponse.json({ interfaces: ['total'] });
        }
        
        const content = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = content.split('\n');
        const interfaces = ['total']; // 'total' represents all interfaces aggregated
        
        // Skip header lines
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(':');
            if (parts.length > 0) {
                const name = parts[0].trim();
                if (name && name !== 'lo') { // Skip loopback
                    interfaces.push(name);
                }
            }
        }

        return NextResponse.json({ interfaces });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
