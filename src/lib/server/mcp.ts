import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z, ZodError } from 'zod';
import { equipmentSchema, patchSchema, ServiceError } from '$lib/validation';
import {
	addEquipment,
	updateEquipment,
	getEquipment,
	listEquipment,
	setComponent,
	createImport,
	applyImport,
	type Actor
} from './equipment';
import { sharedData, searchCatalogue, relevantPrimes } from './catalogue';
import { userClient, verifyMcpAccessToken } from './mcpAuth';
import { configured, siteOrigin } from './config';

type Context = {
	http?: { authInfo?: { token: string; clientId: string; extra?: Record<string, unknown> } };
};
function actor(ctx: Context): Actor {
	const auth = ctx.http?.authInfo;
	if (!auth || typeof auth.extra?.userId !== 'string')
		throw new ServiceError('UNAUTHORIZED', 'Sign in to connect.', 401);
	return { db: userClient(auth.token), userId: auth.extra.userId, clientId: auth.clientId };
}
function result(value: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
async function execute(ctx: Context, fn: (a: Actor) => Promise<unknown>) {
	try {
		return result(await fn(actor(ctx)));
	} catch (e) {
		return {
			...result({
				error: {
					code:
						e instanceof ServiceError
							? e.code
							: e instanceof ZodError
								? 'INVALID_INPUT'
								: 'REQUEST_FAILED',
					message:
						e instanceof ServiceError
							? e.message
							: e instanceof ZodError
								? e.issues.map((i) => i.message).join('; ')
								: 'The request failed. Try again.'
				}
			}),
			isError: true
		};
	}
}
const page = {
	offset: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(100).default(50)
};
const id = z.string().uuid(),
	revision = z.number().int().min(1);
const handler = createMcpHandler(
	(server) => {
		server.registerTool(
			'search_catalogue',
			{
				description: 'Search masterable equipment without adding anything to your tracker.',
				inputSchema: z.object({
					q: z.string().max(160).default(''),
					category: z.string().max(80).default(''),
					...page
				}),
				annotations: { readOnlyHint: true, openWorldHint: false }
			},
			(input, ctx) =>
				execute(ctx, async (a) =>
					searchCatalogue(
						(await sharedData(a.db)).catalogue,
						input.q,
						input.category,
						input.offset,
						input.limit
					)
				)
		);
		server.registerTool(
			'list_tracked_equipment',
			{
				description:
					'List your personal equipment. Set focus=true for starred, unfinished farming targets. Returns revisions needed for updates.',
				inputSchema: z.object({
					q: z.string().max(160).default(''),
					status: z.enum(['missing', 'building', 'owned', 'mastered']).optional(),
					focus: z.boolean().default(false),
					...page
				}),
				annotations: { readOnlyHint: true, openWorldHint: false }
			},
			(input, ctx) =>
				execute(ctx, async (a) => {
					const items = (await listEquipment(a)).filter(
						(i) =>
							(!input.q || i.name.toLowerCase().includes(input.q.toLowerCase())) &&
							(!input.focus || (i.priority && i.status !== 'mastered')) &&
							(!input.status || i.status === input.status)
					);
					return {
						items: items.slice(input.offset, input.offset + input.limit),
						total: items.length,
						nextOffset:
							input.offset + input.limit < items.length ? input.offset + input.limit : null
					};
				})
		);
		server.registerTool(
			'get_equipment',
			{
				description:
					'Read one of your tracked items, owned components, relic rewards, mission sources and source timestamps.',
				inputSchema: z.object({ id }),
				annotations: { readOnlyHint: true, openWorldHint: false }
			},
			(input, ctx) =>
				execute(ctx, async (a) => {
					const item = await getEquipment(a, input.id);
					return {
						item,
						primeData: item.catalogue_id
							? relevantPrimes((await sharedData(a.db)).primes, [item.name])
							: null
					};
				})
		);
		server.registerTool(
			'add_equipment',
			{
				description:
					'Add catalogue or custom equipment. Existing entries keep their progress; repeated adds do not duplicate.',
				inputSchema: equipmentSchema,
				annotations: {
					readOnlyHint: false,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false
				}
			},
			(input, ctx) => execute(ctx, (a) => addEquipment(a, input))
		);
		server.registerTool(
			'update_equipment',
			{
				description:
					'Update your status, notes or priority using the last read revision. priority=true stars an item for Farm focus; mastered items leave active focus. Conflicts require rereading before retrying.',
				inputSchema: z.object({ id, revision, changes: patchSchema.omit({ parts: true }) }),
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
			},
			(input, ctx) =>
				execute(ctx, (a) => updateEquipment(a, input.id, input.revision, input.changes))
		);
		server.registerTool(
			'set_component_quantity',
			{
				description:
					'Set an owned component quantity between zero and the recipe requirement using the last read revision. Collecting the final required copy on missing equipment also sets its status to Building in the same save.',
				inputSchema: z.object({
					id,
					revision,
					component: z.string().max(200),
					quantity: z.number().int().min(0).max(99)
				}),
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
			},
			(input, ctx) =>
				execute(ctx, (a) =>
					setComponent(a, input.id, input.revision, input.component, input.quantity)
				)
		);
		server.registerTool(
			'preview_equipment_import',
			{
				description:
					'Preview JSON v1/v2, Markdown checklist or pasted names. Does not change equipment. Unknown and ambiguous names stay custom. Preview expires in 15 minutes.',
				inputSchema: z.object({
					text: z.string().min(1).max(2000000),
					format: z.enum(['auto', 'json', 'markdown']).default('auto'),
					category: z.string().max(80).default('Other')
				}),
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
			},
			(input, ctx) => execute(ctx, (a) => createImport(a, input.text, input.format, input.category))
		);
		server.registerTool(
			'apply_equipment_import',
			{
				description:
					'Apply a reviewed preview. Merge preserves existing progress by default. Set replaceProgress only when the user explicitly selected replacement values.',
				inputSchema: z.object({ previewId: id, replaceProgress: z.boolean().default(false) }),
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
					idempotentHint: true,
					openWorldHint: false
				}
			},
			(input, ctx) => execute(ctx, (a) => applyImport(a, input.previewId, input.replaceProgress))
		);
	},
	{ serverInfo: { name: 'Warframe Tracker', version: '0.1.0' }, maxSubscriptions: 0 }
);

export async function mcpRequest(request: Request) {
	if (!configured())
		return Response.json({ error: 'Tracker authentication is not configured.' }, { status: 503 });
	const response = await withMcpAuth(handler, verifyMcpAccessToken, {
		required: true,
		resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp',
		// mcp-handler 2.1.1 appends resourceMetadataPath to this base URL.
		resourceUrl: siteOrigin(new URL(request.url))
	})(request);
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id');
	return response;
}
