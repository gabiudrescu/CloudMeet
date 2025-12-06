/**
 * Input validation utilities
 * Provides robust validation for user inputs
 */

/**
 * Maximum length limits for various fields
 */
export const MAX_LENGTHS = {
	name: 100,
	email: 254, // RFC 5321 maximum
	description: 5000,
	notes: 1000,
	slug: 50
} as const;

/**
 * Validate email address using a robust regex
 * Rejects invalid formats like: a@b.c, test@domain..com, @domain.com, user@.com
 */
export function isValidEmail(email: string): boolean {
	if (!email || typeof email !== 'string') {
		return false;
	}

	// Check length (RFC 5321: max 254 characters)
	if (email.length > MAX_LENGTHS.email) {
		return false;
	}

	// Robust email regex that:
	// - Requires local part with valid characters (no leading/trailing dots, no consecutive dots)
	// - Requires @ symbol
	// - Requires domain with at least one dot
	// - Requires TLD of at least 2 characters
	// - Disallows consecutive dots anywhere
	const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

	if (!emailRegex.test(email)) {
		return false;
	}

	// Additional check: no consecutive dots anywhere
	if (email.includes('..')) {
		return false;
	}

	return true;
}

/**
 * Validate string length
 * @returns Error message if invalid, null if valid
 */
export function validateLength(
	value: string | null | undefined,
	fieldName: string,
	maxLength: number,
	required: boolean = false
): string | null {
	if (!value || value.trim().length === 0) {
		if (required) {
			return `${fieldName} is required`;
		}
		return null;
	}

	if (value.length > maxLength) {
		return `${fieldName} must be ${maxLength} characters or less`;
	}

	return null;
}

/**
 * Validate multiple fields at once
 * @returns First error message found, or null if all valid
 */
export function validateFields(validations: (string | null)[]): string | null {
	for (const error of validations) {
		if (error) {
			return error;
		}
	}
	return null;
}
