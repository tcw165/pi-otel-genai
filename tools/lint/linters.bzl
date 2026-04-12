"""Lint aspect definitions used by CI and local lint runs."""

load("@aspect_rules_lint//lint:eslint.bzl", "lint_eslint_aspect")

eslint = lint_eslint_aspect(
    binary = Label("//tools/lint:eslint"),
    configs = [Label("//:eslint_config")],
)
