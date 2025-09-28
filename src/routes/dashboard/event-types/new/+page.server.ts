/**
 * Create new event type
 */

import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getCurrentUser } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	const userId = await getCurrentUser(event);

	if (!userId) {
		throw redirect(302, '/auth/login');
	}

	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const userId = await getCurrentUser(event);

		if (!userId) {
			throw redirect(302, '/auth/login');
		}

		const db = event.platform?.env?.DB;
		if (!db) {
			return fail(500, { error: 'Database not available' });
		}

		const formData = await event.request.formData();
		const name = formData.get('name');
		const slug = formData.get('slug');
		const duration = formData.get('duration');
		const description = formData.get('description') || '';
		const isActive = formData.get('is_active') === 'on';
		const coverImage = formData.get('cover_image') || '';

		if (!name || !slug || !duration) {
			return fail(400, { error: 'Missing required fields' });
		}

		// Validate slug is URL-safe
		const slugStr = slug.toString().toLowerCase();
		if (!/^[a-z0-9-]+$/.test(slugStr)) {
			return fail(400, { error: 'Slug can only contain lowercase letters, numbers, and hyphens' });
		}

		try {
			// Check if slug already exists for this user
			const existing = await db
				.prepare('SELECT id FROM event_types WHERE user_id = ? AND slug = ?')
				.bind(userId, slugStr)
				.first();

			if (existing) {
				return fail(400, { error: 'An event type with this slug already exists' });
			}

			// Insert new event type
			await db
				.prepare(
					`INSERT INTO event_types (user_id, name, slug, duration_minutes, description, is_active, cover_image, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
				)
				.bind(userId, name.toString(), slugStr, parseInt(duration.toString()), description.toString(), isActive ? 1 : 0, coverImage.toString())
				.run();

			throw redirect(302, '/dashboard');
		} catch (error: any) {
			if (error?.status === 302) throw error; // Re-throw redirects
			console.error('Error creating event type:', error);
			return fail(500, { error: 'Failed to create event type' });
		}
	}
};
