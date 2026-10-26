<script lang="ts">
	import { farmingPlan, type FarmStage, type EquipmentSort } from '$lib/farming';
	import type { Snapshot, TrackedItem } from '$lib/types';
	import EquipmentCard from './EquipmentCard.svelte';
	import SortControl from './SortControl.svelte';
	let {
		items,
		snapshot,
		pending,
		savingIds = new Set<string>(),
		blockedIds = new Set<string>(),
		onupdate,
		oncomponent
	}: {
		items: TrackedItem[];
		snapshot: Snapshot;
		pending: boolean;
		savingIds?: Set<string>;
		blockedIds?: Set<string>;
		onupdate: (item: TrackedItem, patch: unknown) => void;
		oncomponent: (item: TrackedItem, part: string, count: number) => void;
	} = $props();
	let missionOnly = $state(false),
		showAll = $state(false);
	let sort = $state<EquipmentSort>('name');
	let plan = $derived(farmingPlan(items, snapshot, sort));
	let relics = $derived(plan.relics.filter((r) => !missionOnly || r.farms.length));
	const stages: { id: FarmStage; title: string; hint: string }[] = [
		{
			id: 'farm',
			title: 'Farm next',
			hint: 'Collect the missing components below, or check the acquisition wiki for other equipment.'
		},
		{
			id: 'components-ready',
			title: 'Components ready',
			hint: 'All tracked Prime components collected. Check crafting resources and credits in game, then set the status to Building.'
		},
		{
			id: 'building',
			title: 'In the Foundry',
			hint: 'Claim these when crafting finishes, then set Owned / levelling.'
		},
		{
			id: 'level',
			title: 'Ready to level',
			hint: 'Finish levelling, then mark Mastered to remove the item from your active focus.'
		}
	];
	const wiki = (name: string) =>
		`https://wiki.warframe.com/w/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
	const percent = (n: number | undefined) =>
		typeof n === 'number' ? `${Number(n.toFixed(2))}%` : 'Unavailable';
</script>

{#if !plan.targets.length}
	<div class="empty focusEmpty">
		<h3>Choose your next targets.</h3>
		<p>
			Use the ☆ beside equipment in My equipment to add it to Farm focus. Mastered items leave this
			view automatically.
		</p>
		<a href="/tracker">Choose equipment →</a>
	</div>
{:else}
	<div class="focusMetrics" aria-label="Farming stages">
		{#each stages as stage}
			<div>
				<strong>{plan.targets.filter((t) => t.stage === stage.id).length}</strong><span
					>{stage.title}</span
				>
			</div>
		{/each}
	</div>

	{#if plan.relics.length}
		<section class="focusRelics panel" aria-labelledby="relic-plan-heading">
			<div class="focusIntro">
				<div>
					<h3 id="relic-plan-heading">Relic plan</h3>
				</div>
				<label class="checklabel"
					><input type="checkbox" bind:checked={missionOnly} /> Listed mission drops only</label
				>
			</div>
			{#each showAll ? relics : relics.slice(0, 6) as relic (relic.name)}
				<details class="focusRelic">
					<summary
						><strong>{relic.name}</strong><span
							>{relic.targetCount}
							{relic.targetCount === 1 ? 'target' : 'targets'} · {relic.rewards.length} useful {relic
								.rewards.length === 1
								? 'reward'
								: 'rewards'}</span
						><span class="meta"
							>{relic.farms.length ? 'Mission drops listed' : 'No mission source listed'}</span
						></summary
					>
					<ul class="focusRewards">
						{#each relic.rewards as reward}
							<li>
								<div>
									<strong>{reward.part}</strong><span class="meta"
										>{reward.missing} still needed · {reward.itemName}</span
									>
								</div>
								<span class="meta"
									>Opening: Intact {percent(reward.chances.Intact)} · Radiant {percent(
										reward.chances.Radiant
									)}</span
								>
							</li>
						{/each}
					</ul>
					{#if relic.farms.length}
						<p class="meta">
							Highest listed mission reward chances (chance to receive this relic):
						</p>
						<ul class="focusSources">
							{#each relic.farms.toSorted((a, b) => b.chance - a.chance).slice(0, 3) as farm}<li>
									<a href={wiki(farm.node)} target="_blank" rel="noreferrer"
										>{farm.planet} / {farm.node}</a
									>
									· {farm.mode} · {farm.rotation === 'Completion'
										? 'Completion'
										: `Rotation ${farm.rotation}`} · {percent(farm.chance)}
								</li>{/each}
						</ul>
					{:else}<p class="meta">
							No regular mission drop is listed in this snapshot. Existing relics can still be
							opened; check the wiki for vaulting, Resurgence and other sources.
						</p>{/if}
					<a href={`${wiki(relic.name)}#Drop_Locations`} target="_blank" rel="noreferrer"
						>All sources &amp; availability ↗</a
					>
				</details>
			{:else}<p>
					No relics with listed mission drops match these targets. Turn off the filter to see other
					relics.
				</p>{/each}
			{#if relics.length > 6}<button class="subtle" onclick={() => (showAll = !showAll)}
					>{showAll ? 'Show fewer relics' : `Show all ${relics.length} relics`}</button
				>{/if}
			<details class="dataInfo">
				<summary>About relic data</summary>
				<p class="caption">
					Relics covering more targets appear first, not necessarily the fastest farms. Each opening
					gives one reward. Opening chances are per relic; mission percentages are the chance to
					receive that relic. Collected parts leave this plan automatically.
				</p>
				<p class="caption">
					Snapshot retrieved {new Date(snapshot.retrievedAt).toLocaleDateString('en-GB')}.
					Availability may change. Sources:
					<a href="https://www.warframe.com/droptables" target="_blank" rel="noreferrer"
						>Digital Extremes</a
					>
					via
					<a href="https://github.com/WFCD/warframe-drop-data" target="_blank" rel="noreferrer"
						>WFCD drop data</a
					>; recipes from
					<a href="https://github.com/WFCD/warframe-items" target="_blank" rel="noreferrer"
						>WFCD items</a
					>.
				</p>
			</details>
		</section>
	{/if}

	<div class="controls focusSort"><SortControl bind:value={sort} /></div>
	{#each stages as stage}
		{@const targets = plan.targets.filter((t) => t.stage === stage.id)}
		{#if targets.length}
			<section class="focusStage" aria-label={stage.title}>
				<div class="listhead">
					<h3 title={stage.hint}>{stage.title}</h3>
					<span class="meta">{targets.length} {targets.length === 1 ? 'target' : 'targets'}</span>
				</div>
				{#each targets as target (target.item.id)}
					<div class="focusTarget" role="group" aria-label={`Farming target: ${target.item.name}`}>
						<EquipmentCard
							item={target.item}
							{snapshot}
							pending={pending || blockedIds.has(target.item.id)}
							saving={savingIds.has(target.item.id)}
							{onupdate}
							{oncomponent}
							showEffort={sort === 'effort'}
						/>
						{#if stage.id === 'farm' && target.needed.length}
							<ul class="focusNeeds" aria-label={`Missing components for ${target.item.name}`}>
								{#each target.needed as part (part.name)}
									<li>
										<div>
											<strong>{part.name.replace(target.item.name + ' ', '')}</strong><span
												class="meta"
												>{part.missing} still needed · {part.owned}/{part.count} owned{!part.relics
													.length
													? ' · No relic mapping listed'
													: ''}</span
											>
										</div>
										<button
											disabled={pending || blockedIds.has(target.item.id)}
											aria-label={`Collect one ${part.name}`}
											onclick={() => oncomponent(target.item, part.name, part.owned + 1)}
											>+1 owned</button
										>
									</li>
								{/each}
							</ul>
						{:else if stage.id === 'farm' && /\bPrime\b/i.test(target.item.name)}<p
								class="meta focusFallback"
							>
								No verified relic mapping. Check acquisition in the wiki.
							</p>{/if}
					</div>
				{/each}
			</section>
		{/if}
	{/each}
{/if}
