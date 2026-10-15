import { NextResponse } from 'next/server';
import {
    getAllUserMediaRatings,
    saveUserMediaRating,
    deleteUserMediaRating,
    getUserMediaFavorites,
    toggleUserMediaFavorite,
    UserMediaRating
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ratings = getAllUserMediaRatings();
        const favorites = getUserMediaFavorites();
        return NextResponse.json({
            success: true,
            ratings,
            favorites
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Failed to fetch ratings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { action, rating, itemKey } = body;

        if (action === 'save_rating' && rating && rating.itemKey) {
            saveUserMediaRating(rating as UserMediaRating);
            return NextResponse.json({
                success: true,
                rating,
                ratings: getAllUserMediaRatings()
            });
        }

        if (action === 'delete_rating' && itemKey) {
            deleteUserMediaRating(itemKey);
            return NextResponse.json({
                success: true,
                ratings: getAllUserMediaRatings()
            });
        }

        if (action === 'toggle_favorite' && itemKey) {
            const res = toggleUserMediaFavorite(itemKey);
            return NextResponse.json({
                success: true,
                isFavorite: res.isFavorite,
                favorites: res.favorites
            });
        }

        return NextResponse.json({ success: false, error: 'Invalid ratings action' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Error processing rating request' }, { status: 500 });
    }
}
