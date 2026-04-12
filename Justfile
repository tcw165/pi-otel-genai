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
