export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
	const response = await fetch(url, {
		method,
		headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	let data;
	try {
		data = await response.json();
	} catch {
		throw Error('The server could not complete this request. Please try again.');
	}
	if (!response.ok) throw Error(data.error?.message || 'Your changes could not be saved.');
	return data as T;
}
