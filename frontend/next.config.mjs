// Pin the Turbopack root to this app; the repo-root lockfile otherwise wins
// inference and Next.js walks up to /Users/saislife looking for a repo.
const config = {
  turbopack: {
    root: import.meta.dirname,
  },
};

export default config;
