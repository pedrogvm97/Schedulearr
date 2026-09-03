import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.png': return 'image/png';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        default: return 'image/jpeg';
    }
}

// Stylized fallback SVG when no artwork is available online
function generateFallbackSvg(title: string): string {
    const safeTitle = (title || 'Audio').substring(0, 24);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
        <rect width="300" height="300" rx="24" fill="#0e0e11"/>
        <circle cx="150" cy="150" r="100" fill="#18181b" stroke="#27272a" stroke-width="4"/>
        <circle cx="150" cy="150" r="70" fill="#121215" stroke="#3f3f46" stroke-width="2"/>
        <circle cx="150" cy="150" r="30" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="150" cy="150" r="10" fill="#f59e0b"/>
        <text x="150" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#71717a" text-anchor="middle">${safeTitle}</text>
    </svg>`;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const artist = searchParams.get('artist') || '';
        const album = searchParams.get('album') || '';
        const title = searchParams.get('title') || '';
        const rawPath = searchParams.get('path');

        // 1. If direct image path is supplied and exists
        if (rawPath && fs.existsSync(rawPath)) {
            try {
                const stat = fs.statSync(rawPath);
                if (stat.isFile() && stat.size > 100) {
                    const fileStream = fs.createReadStream(rawPath);
                    // @ts-ignore
                    return new Response(fileStream as any, {
                        headers: {
                            'Content-Type': getMimeType(rawPath),
                            'Content-Length': String(stat.size),
                            'Cache-Control': 'public, max-age=86400, immutable'
                        }
                    });
                }
            } catch {}
        }

        // 2. Check local directories matching artist and album in known music folders
        let candidateFolders: string[] = [];
        try {
            const rows: any[] = db.prepare("SELECT folders FROM theater_libraries WHERE type = 'music'").all();
            for (const r of rows) {
                const f = typeof r.folders === 'string' ? JSON.parse(r.folders) : r.folders;
                if (Array.isArray(f)) candidateFolders.push(...f);
            }
        } catch {}

        candidateFolders.push('/music', '/media/music', './data/music', 'C:\\music');

        let targetDir: string | null = null;
        for (const root of candidateFolders) {
            if (!fs.existsSync(root)) continue;
            const fullAlbumPath = path.join(root, artist, album);
            if (fs.existsSync(fullAlbumPath)) {
                targetDir = fullAlbumPath;
                break;
            }
            // Also check flat artist - album directory
            const flatPath = path.join(root, `${artist} - ${album}`);
            if (fs.existsSync(flatPath)) {
                targetDir = flatPath;
                break;
            }
        }

        // If target directory has local companion image
        if (targetDir) {
            for (const coverName of ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'album.jpg', 'albumart.jpg']) {
                const cPath = path.join(targetDir, coverName);
                if (fs.existsSync(cPath)) {
                    const stat = fs.statSync(cPath);
                    if (stat.size > 200) {
                        const fileStream = fs.createReadStream(cPath);
                        // @ts-ignore
                        return new Response(fileStream as any, {
                            headers: {
                                'Content-Type': getMimeType(cPath),
                                'Content-Length': String(stat.size),
                                'Cache-Control': 'public, max-age=86400, immutable'
                            }
                        });
                    }
                }
            }
        }

        // 2B. Artist Portrait Handling (when album is not specified or is generic)
        const isArtistOnly = artist && (!album || album === 'Single' || album === 'Unknown Album' || album === 'Track' || album.trim() === '');
        if (isArtistOnly) {
            // Check local artist directory for artist.jpg, folder.jpg, etc.
            for (const root of candidateFolders) {
                if (!fs.existsSync(root)) continue;
                const artistDir = path.join(root, artist);
                if (fs.existsSync(artistDir)) {
                    for (const aImg of ['artist.jpg', 'artist.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'logo.png']) {
                        const aPath = path.join(artistDir, aImg);
                        if (fs.existsSync(aPath)) {
                            const stat = fs.statSync(aPath);
                            if (stat.isFile() && stat.size > 200) {
                                const fileStream = fs.createReadStream(aPath);
                                // @ts-ignore
                                return new Response(fileStream as any, {
                                    headers: {
                                        'Content-Type': getMimeType(aPath),
                                        'Content-Length': String(stat.size),
                                        'Cache-Control': 'public, max-age=86400, immutable'
                                    }
                                });
                            }
                        }
                    }
                }
            }

            // Online Deezer Artist Search for official high-resolution artist portrait
            try {
                const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`, {
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const dzArtist = dzRes.data?.data?.[0];
                const picUrl = dzArtist?.picture_xl || dzArtist?.picture_big || dzArtist?.picture_medium;
                if (picUrl && picUrl.startsWith('http')) {
                    const imgRes = await axios.get(picUrl, {
                        responseType: 'arraybuffer',
                        timeout: 6000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const imgBuf = Buffer.from(imgRes.data);
                    if (imgBuf.length > 500) {
                        return new Response(imgBuf as any, {
                            headers: {
                                'Content-Type': 'image/jpeg',
                                'Content-Length': String(imgBuf.length),
                                'Cache-Control': 'public, max-age=86400, immutable'
                            }
                        });
                    }
                }
            } catch {}
        }

        // 3. Query iTunes and Deezer with prioritized candidate terms
        const cleanAlbum = album
            .replace(/\s*[\(\[][^\)\]]*(?:deluxe|edition|remaster|bonus|explicit|version|repack|anniversary|expanded|special)[^\)\]]*[\)\]]/gi, '')
            .trim();

        const candidateQueries = Array.from(new Set([
            `${artist} ${album}`.trim(),
            cleanAlbum && cleanAlbum !== album ? `${artist} ${cleanAlbum}`.trim() : '',
            title ? `${artist} ${title}`.trim() : '',
            cleanAlbum || album
        ])).filter(Boolean);

        for (const queryTerm of candidateQueries) {
            // A. iTunes Search
            try {
                const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(queryTerm)}&entity=album&limit=1`, {
                    timeout: 4000,
                    headers: { 'User-Agent': 'Schedulearr/0.5.76' }
                });

                if (Array.isArray(itunesRes.data?.results) && itunesRes.data.results.length > 0) {
                    const itunesAlbum = itunesRes.data.results[0];
                    const rawArtwork = itunesAlbum.artworkUrl100 || '';
                    const hiResArtwork = rawArtwork.replace(/100x100bb/g, '600x600bb').replace(/100x100/g, '600x600');

                    if (hiResArtwork && hiResArtwork.startsWith('http')) {
                        const imgRes = await axios.get(hiResArtwork, {
                            responseType: 'arraybuffer',
                            timeout: 6000,
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        });

                        const imgBuffer = Buffer.from(imgRes.data);
                        if (imgBuffer.length > 500) {
                            if (targetDir && fs.existsSync(targetDir)) {
                                try {
                                    fs.writeFileSync(path.join(targetDir, 'cover.jpg'), imgBuffer);
                                    fs.writeFileSync(path.join(targetDir, 'folder.jpg'), imgBuffer);
                                } catch {}
                            }

                            return new Response(imgBuffer as any, {
                                headers: {
                                    'Content-Type': 'image/jpeg',
                                    'Content-Length': String(imgBuffer.length),
                                    'Cache-Control': 'public, max-age=86400, immutable'
                                }
                            });
                        }
                    }
                }
            } catch {}

            // B. Deezer Search
            try {
                const deezerRes = await axios.get(`https://api.deezer.com/search/album?q=${encodeURIComponent(queryTerm)}&limit=1`, {
                    timeout: 4000,
                    headers: { 'User-Agent': 'Schedulearr/0.5.76' }
                });

                if (Array.isArray(deezerRes.data?.data) && deezerRes.data.data.length > 0) {
                    const dz = deezerRes.data.data[0];
                    const dzCover = dz.cover_xl || dz.cover_big || dz.cover_medium;
                    if (dzCover) {
                        const imgRes = await axios.get(dzCover, {
                            responseType: 'arraybuffer',
                            timeout: 6000,
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        const imgBuffer = Buffer.from(imgRes.data);
                        if (imgBuffer.length > 500) {
                            if (targetDir && fs.existsSync(targetDir)) {
                                try {
                                    fs.writeFileSync(path.join(targetDir, 'cover.jpg'), imgBuffer);
                                    fs.writeFileSync(path.join(targetDir, 'folder.jpg'), imgBuffer);
                                } catch {}
                            }
                            return new Response(imgBuffer as any, {
                                headers: {
                                    'Content-Type': 'image/jpeg',
                                    'Content-Length': String(imgBuffer.length),
                                    'Cache-Control': 'public, max-age=86400, immutable'
                                }
                            });
                        }
                    }
                }
            } catch {}
        }

        // 4B. Fallback to Artist Portrait if album-specific artwork could not be found
        if (artist) {
            try {
                const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`, {
                    timeout: 4000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const dzArtist = dzRes.data?.data?.[0];
                const picUrl = dzArtist?.picture_xl || dzArtist?.picture_big || dzArtist?.picture_medium;
                if (picUrl && picUrl.startsWith('http')) {
                    const imgRes = await axios.get(picUrl, {
                        responseType: 'arraybuffer',
                        timeout: 5000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const imgBuf = Buffer.from(imgRes.data);
                    if (imgBuf.length > 500) {
                        return new Response(imgBuf as any, {
                            headers: {
                                'Content-Type': 'image/jpeg',
                                'Content-Length': String(imgBuf.length),
                                'Cache-Control': 'public, max-age=86400, immutable'
                            }
                        });
                    }
                }
            } catch {}
        }

        // 5. Stylized SVG Disc Placeholder Fallback (Ensures broken image icons NEVER appear)
        const svgContent = generateFallbackSvg(album || artist || 'Music');
        return new Response(svgContent, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (e: any) {
        const svgContent = generateFallbackSvg('Music');
        return new Response(svgContent, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'no-cache'
            }
        });
    }
}
