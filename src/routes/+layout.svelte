<script lang="ts">
  import 'katex/dist/katex.min.css';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();
</script>

{@render children?.()}
