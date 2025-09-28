/**
 * Bookings API endpoint
 * Creates new bookings and adds them to Google Calendar
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCalendarEvent, getValidAccessToken } from '$lib/server/google-calendar';
import { sendBookingEmail, sendAdminNotificationEmail, getEmailTemplates, isEmailEnabled, type EmailTemplateType } from '$lib/server/email';

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) {
		throw error(500, 'Platform env not available');
	}

	try {
		const body = await request.json() as {
			eventSlug: string;
			startTime: string;
			endTime: string;
			attendeeName: string;
			attendeeEmail: string;
			notes?: string;
			turnstileToken?: string;
			timezone?: string;
		};
		const { eventSlug, startTime, endTime, attendeeName, attendeeEmail, notes, turnstileToken, timezone } = body;

		// Validate required fields
		if (!eventSlug || !startTime || !endTime || !attendeeName || !attendeeEmail) {
			throw error(400, 'Missing required fields');
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(attendeeEmail)) {
			throw error(400, 'Invalid email address');
		}

		// Verify Turnstile token (if provided)
		if (turnstileToken) {
			const turnstileResponse = await fetch(
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						secret: env.TURNSTILE_SECRET_KEY || '',
						response: turnstileToken
					})
				}
			);

			const turnstileResult = await turnstileResponse.json() as { success: boolean };
			if (!turnstileResult.success) {
				throw error(400, 'Turnstile verification failed');
			}
		}

		const db = env.DB;

		// Get the first (and only) user for single-user setup
		const user = await db
			.prepare('SELECT id, email, name, slug, contact_email, settings, brand_color FROM users LIMIT 1')
			.first<{ id: string; email: string; name: string; slug: string; contact_email: string | null; settings: string | null; brand_color: string | null }>();

		if (!user) {
			throw error(404, 'User not found');
		}

		const eventType = await db
			.prepare('SELECT id, name, duration_minutes as duration, description FROM event_types WHERE user_id = ? AND slug = ? AND is_active = 1')
			.bind(user.id, eventSlug)
			.first<{ id: string; name: string; duration: number; description: string }>();

		if (!eventType) {
			throw error(404, 'Event type not found or inactive');
		}

		// Verify slot is still available
		const startDateTime = new Date(startTime);
		const endDateTime = new Date(endTime);

		// Check for conflicts with existing bookings
		const conflict = await db
			.prepare(
				`SELECT id FROM bookings
				WHERE user_id = ? AND status = 'confirmed'
				AND (
					(start_time <= ? AND end_time > ?)
					OR (start_time < ? AND end_time >= ?)
					OR (start_time >= ? AND end_time <= ?)
				)`
			)
			.bind(user.id, startTime, startTime, endTime, endTime, startTime, endTime)
			.first();

		if (conflict) {
			throw error(409, 'This time slot is no longer available');
		}

		// Create calendar event in Google Calendar
		let calendarEventId: string | null = null;
		let meetingUrl: string | null = null;

		try {
			const accessToken = await getValidAccessToken(
				db,
				user.id,
				env.GOOGLE_CLIENT_ID,
				env.GOOGLE_CLIENT_SECRET
			);

			const calendarEvent = await createCalendarEvent(accessToken, {
				summary: `${eventType.name} with ${attendeeName}`,
				description: `${eventType.description || ''}\n\nAttendee: ${attendeeName} (${attendeeEmail})${notes ? `\n\nNotes from attendee:\n${notes}` : ''}`,
				start: {
					dateTime: startDateTime.toISOString(),
					timeZone: 'UTC'
				},
				end: {
					dateTime: endDateTime.toISOString(),
					timeZone: 'UTC'
				},
				attendees: [
					{ email: attendeeEmail }
				],
				conferenceData: {
					createRequest: {
						requestId: crypto.randomUUID(),
						conferenceSolutionKey: { type: 'hangoutsMeet' }
					}
				}
			});

			calendarEventId = calendarEvent.id;
			// Use the Google Meet link from the calendar event
			meetingUrl = calendarEvent.hangoutLink || calendarEvent.htmlLink || null;
		} catch (err) {
			console.error('Error creating Google Calendar event:', err);
			// Continue without calendar event if there's an error
		}

		// Create booking in database
		const result = await db
			.prepare(
				`INSERT INTO bookings (
					user_id, event_type_id, start_time, end_time,
					attendee_name, attendee_email, attendee_notes, status,
					google_event_id, meeting_url, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, CURRENT_TIMESTAMP)`
			)
			.bind(
				user.id,
				eventType.id,
				startTime,
				endTime,
				attendeeName,
				attendeeEmail,
				notes || null,
				calendarEventId,
				meetingUrl
			)
			.run();

		// Invalidate availability cache
		const dateStr = startDateTime.toISOString().split('T')[0];
		const cacheKey = `availability:${eventSlug}:${dateStr}`;
		await env.KV.delete(cacheKey);

		// Send booking confirmation email via Emailit (if enabled)
		if (env.EMAILIT_API_KEY) {
			try {
				// Parse user settings for time format
				let timeFormat: '12h' | '24h' = '12h';
				try {
					const settings = user.settings ? JSON.parse(user.settings) : {};
					timeFormat = settings.timeFormat === '24h' ? '24h' : '12h';
				} catch {
					// Keep default
				}

				// Use contact email for reply-to if available
				const replyToEmail = user.contact_email || user.email;

				// Get the booking ID (it's a UUID string, not integer)
				const bookingResult = await db
					.prepare('SELECT id FROM bookings WHERE google_event_id = ? OR (user_id = ? AND start_time = ? AND attendee_email = ?)')
					.bind(calendarEventId, user.id, startTime, attendeeEmail)
					.first<{ id: string }>();
				const bookingId = bookingResult?.id || result.meta.last_row_id?.toString() || '';

				// Get email templates to check if confirmation is enabled
				const templates = await getEmailTemplates(db, user.id);
				const confirmationEnabled = isEmailEnabled(templates, 'confirmation');

				const emailData = {
					attendeeName,
					attendeeEmail,
					eventName: eventType.name,
					eventDescription: eventType.description || '',
					startTime: startDateTime,
					endTime: endDateTime,
					meetingUrl,
					bookingId,
					hostName: user.name,
					hostEmail: user.email,
					hostContactEmail: user.contact_email || undefined,
					appUrl: env.APP_URL || '',
					timeFormat,
					timezone: timezone || 'UTC',
					brandColor: user.brand_color || undefined,
					attendeeNotes: notes || undefined
				};

				if (confirmationEnabled) {
					const template = templates.get('confirmation');
					await sendBookingEmail(
						{
							...emailData,
							customMessage: template?.custom_message
						},
						{
							apiKey: env.EMAILIT_API_KEY,
							from: env.EMAIL_FROM || user.email,
							replyTo: replyToEmail
						},
						template?.subject || undefined
					);
				}

				// Send admin notification email to contact_email (or fallback to main email)
				await sendAdminNotificationEmail(
					emailData,
					user.contact_email || user.email,
					{
						apiKey: env.EMAILIT_API_KEY,
						from: env.EMAIL_FROM || user.email
					}
				);

				// Schedule reminder emails
				const reminderTypes: EmailTemplateType[] = ['reminder_24h', 'reminder_1h'];
				const reminderOffsets: Record<string, number> = {
					'reminder_24h': 24 * 60 * 60 * 1000, // 24 hours
					'reminder_1h': 60 * 60 * 1000 // 1 hour
				};

				for (const reminderType of reminderTypes) {
					if (isEmailEnabled(templates, reminderType)) {
						const scheduledFor = new Date(startDateTime.getTime() - reminderOffsets[reminderType]);
						// Only schedule if the reminder time is in the future
						if (scheduledFor > new Date()) {
							await db
								.prepare(`INSERT INTO scheduled_emails (booking_id, template_type, scheduled_for) VALUES (?, ?, ?)`)
								.bind(bookingId, reminderType, scheduledFor.toISOString())
								.run();
						}
					}
				}
			} catch (emailError) {
				console.error('Failed to send confirmation email:', emailError);
			}
		}

		return json({
			success: true,
			bookingId: result.meta.last_row_id,
			meetingUrl
		});
	} catch (err: any) {
		console.error('Booking creation error:', err);
		if (err?.status) throw err; // Re-throw SvelteKit errors
		throw error(500, 'Failed to create booking');
	}
};
