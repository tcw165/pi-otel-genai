# Create a new changeset (describe change + pick semver bump)
changeset:
    pnpm changeset

# Apply pending changesets → bump version + write CHANGELOG.md
changeset-version:
    pnpm changeset version

# Build dist + publish to npm
changeset-publish: dist
    pnpm changeset publish

# Lint all TypeScript sources via ESLint (rules_lint aspect)
lint:
    bazel build //... \
        --aspects //tools/lint:linters.bzl%eslint \
        --output_groups=+rules_lint_report \
        --@aspect_rules_lint//lint:fail_on_violation=true

# Test whole project
test:
    bazel test //...

# Build TypeScript → JS/d.ts and copy output to ./dist/
dist:
    bazel build //:dist
    chmod -R u+w dist/ 2>/dev/null || true
    rm -rf dist/
    cp -rL bazel-bin/dist/ dist/
    chmod -R u+w dist/

clean-dist:
    rm -rf dist/
