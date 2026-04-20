<script lang="ts">
  import { onMount } from 'svelte';
  import 'katex/dist/katex.min.css';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  onMount(() => {
    if (import.meta.env.DEV) return;
    const suppress = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', suppress);
    return () => window.removeEventListener('contextmenu', suppress);
  });
</script>

{@render children?.()}
