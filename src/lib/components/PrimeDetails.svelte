<script lang="ts">
	import type { Snapshot } from '$lib/types';
	let {
		name,
		snapshot,
		owned = {},
		onchange,
		onownall,
		disabled = false
	}: {
		name: string;
		snapshot: Snapshot;
		owned?: Record<string, number>;
		onchange?: (part: string, count: number) => void;
		onownall?: () => void;
		disabled?: boolean;
	} = $props();
	let farmableOnly = $state(false);
	let prime = $derived(snapshot.equipment[name.toLowerCase().replace(/[^a-z0-9]/g, '')]);
	let complete = $derived(prime?.parts.filter((p) => (owned[p.name] || 0) >= p.count).length || 0);
	const percent = (n: number | undefined) =>
		typeof n === 'number' ? `${Number(n.toFixed(2))}%` : '—';
	const wiki = (name: string) =>
		`https://wiki.warframe.com/w/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
	const date = (n: number | string) =>
		new Date(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

{#if /\bPrime\b/i.test(name)}
	<details class="primePanel">
		<summary
			><span
				>Relics &amp; parts{prime?.parts.length ? ` · ${complete}/${prime.parts.length}` : ''}</span
			>
			{#if onownall && prime?.parts.length}
				<button
					type="button"
					class="ownAllParts"
					disabled={disabled || complete === prime.parts.length}
					title={complete === prime.parts.length ? 'All parts owned' : 'Mark all parts as owned'}
					aria-label={`Mark all parts owned for ${name}`}
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onownall?.();
					}}
				>
					<svg
						aria-hidden="true"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="m18 6-11 11-5-5m20-2-7 7-4-4" /></svg
					>
				</button>
			{/if}</summary
		>
		{#if prime}<div class="primeTop">
				<div>
					<h3>{prime.name} · components</h3>
					<p>
						{prime.vaulted === true
							? 'Listed as vaulted in the item registry. Owned relics can still be opened; Resurgence availability may differ.'
							: prime.vaulted === false
								? 'Listed as unvaulted in the item registry. Check each relic for listed mission sources.'
								: 'Vault status is not supplied by the item registry.'}
					</p>
				</div>
				<a href={`${prime.wiki}#Acquisition`} target="_blank" rel="noreferrer">Acquisition wiki ↗</a
				>
			</div>
			<label class="primeFilter"
				><input type="checkbox" bind:checked={farmableOnly} /> Only show relics with listed mission drops</label
			>
			{#each prime.parts as part (part.name)}{@const have = owned[part.name] || 0}{@const relics =
					part.relics
						.filter((r) => !farmableOnly || snapshot.farms[r.name]?.length)
						.toSorted(
							(a, b) =>
								Number(!!snapshot.farms[b.name]?.length) -
									Number(!!snapshot.farms[a.name]?.length) || a.name.localeCompare(b.name)
						)}
				<section class="primePart">
					<div class="partTitle">
						<h4>
							{part.name.replace(prime.name + ' ', '')}
							<span class="meta">{have}/{part.count} owned</span>
						</h4>
						<div class="partChecks">
							{#each Array(part.count).fill(0) as _, n}<label
									><input
										type="checkbox"
										checked={have > n}
										disabled={disabled || !onchange}
										aria-label={`Own ${part.name}, copy ${n + 1} of ${part.count}`}
										onchange={(e) => {
											const count = e.currentTarget.checked ? n + 1 : n;
											e.currentTarget.checked = have > n;
											onchange?.(part.name, count);
										}}
									/>{part.count > 1 ? `Copy ${n + 1}` : 'Have part'}</label
								>{/each}
						</div>
					</div>
					{#each relics as relic (relic.name)}{@const farms = snapshot.farms[relic.name] || []}
						<div class="relicRow">
							<div>
								<a href={wiki(relic.name)} target="_blank" rel="noreferrer">{relic.name} ↗</a><span
									class="badge"
									>{relic.chances.Intact >= 20
										? 'Common'
										: relic.chances.Intact >= 10
											? 'Uncommon'
											: 'Rare'}</span
								>
								<div class="meta">
									{farms.length
										? 'Mission drops listed'
										: 'No mission drops listed · may be vaulted or rotation-only'}
								</div>
							</div>
							<div class="chances">
								<span>Intact <b>{percent(relic.chances.Intact)}</b></span><span
									>Radiant <b>{percent(relic.chances.Radiant)}</b></span
								>
							</div>
							<details class="farms">
								<summary
									>{farms.length
										? `Where to farm · ${farms.length} sources`
										: 'Availability & farming'}</summary
								>{#if farms.length}<p class="meta">
										Highest listed reward chances first; this is not a fastest-farm ranking.
									</p>
									<ul>
										{#each farms as farm}<li>
												<a href={wiki(farm.node)} target="_blank" rel="noreferrer"
													>{farm.planet} / {farm.node}</a
												>
												· {farm.mode} · {farm.rotation === 'Completion'
													? 'Completion'
													: `Rotation ${farm.rotation}`} · <b>{percent(farm.chance)}</b>
											</li>{/each}
									</ul>{:else}<p>
										No regular mission source was found in this snapshot. Check the wiki for
										vaulting, Prime Resurgence, vendors, or other acquisition methods.
									</p>{/if}<a
									href={`${wiki(relic.name)}#Drop_Locations`}
									target="_blank"
									rel="noreferrer">Relic acquisition wiki ↗</a
								>
							</details>
						</div>{:else}<p class="meta">
							{part.relics.length
								? 'No relics match this filter. Turn off the filter to see all relics.'
								: 'No relic mapping in this snapshot. This may be a crafted prerequisite or a non-relic acquisition; check the item wiki.'}
						</p>{/each}
				</section>
			{:else}<p>No relic components were found for this item.</p>{/each}
			<details class="dataInfo">
				<summary>About drops &amp; data</summary>
				<p class="caption">
					Drop tables updated {date(snapshot.modified)} · Snapshot retrieved {date(
						snapshot.retrievedAt
					)}. Opening chances are per relic, not squad odds. Mission percentages are chances to
					obtain the relic at that reward rotation. Owning parts does not mark equipment mastered.
				</p>
				<p class="caption">
					Sources: <a href="https://www.warframe.com/droptables" target="_blank" rel="noreferrer"
						>Digital Extremes drop tables</a
					>
					via
					<a href="https://github.com/WFCD/warframe-drop-data" target="_blank" rel="noreferrer"
						>WFCD drop data</a
					>; recipes and vault status:
					<a href="https://github.com/WFCD/warframe-items" target="_blank" rel="noreferrer"
						>WFCD items</a
					>. Availability is a snapshot, not a live guarantee.
					<a href="/WFCD-LICENSE.txt" target="_blank">Data license</a>.
				</p>
			</details>
		{:else}<p>
				No verified relic mapping is available for this equipment. Custom entries are not matched to
				Prime recipes automatically.
			</p>
			<a
				href={`${wiki('Special:Search')}?search=${encodeURIComponent(name)}`}
				target="_blank"
				rel="noreferrer">Search the wiki ↗</a
			>{/if}
	</details>
{/if}
