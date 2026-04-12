# Build TypeScript → JS/d.ts and copy output to ./dist/
dist:
    bazel build //:dist
    rm -rf dist/
    cp -rL bazel-bin/dist/ dist/

clean-dist:
    rm -rf dist/
