<script lang="ts">
	import type { EquipmentSort } from '$lib/farming';
	let { value = $bindable<EquipmentSort>('priority') } = $props();
</script>

<select
	aria-label="Sort equipment"
	bind:value
	title={value === 'effort'
		? 'Fewest missing component copies first. Equipment without component data appears last.'
		: 'Sort equipment'}
>
	<option value="priority">Priority first</option>
	<option value="name">Name</option>
	<option value="effort">Effort</option>
</select>
