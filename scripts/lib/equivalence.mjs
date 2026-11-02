// Equivalence checks for behaviour-preserving refactors of src/.
//
// canonicalize(code) renames every binding (scope-aware) to $0, $1, ... in
// declaration order, so two programs that differ only in local names give
// identical output. With { normalizeSyntax: true } the result also goes
// through esbuild's syntax minifier, which folds `if (a) b()` / `a && b()`,
// statement lists / comma sequences, `true` / `!0` and similar spellings
// into one form. It additionally puts a literal operand of ==/!=/===/!== on
// the left (operand order is unobservable when one side is a literal), expands
// `return void x` to `x; return;` (void evaluates x and yields undefined) and,
// with { ignoreDeclarationKind: true }, treats var/let/const alike. That last
// option hides hoisting/TDZ differences, so changing a declaration kind needs
// its own review.

import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';
import { transformSync } from 'esbuild';

const traverse = traverseModule.default ?? traverseModule;
const generate = generateModule.default ?? generateModule;

const EQUALITY = new Set(['==', '!=', '===', '!==']);
const isPlainLiteral = (node) =>
    t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node);

// With { inlineSingleUseFunctions: true }, a function declaration whose only
// reference is a single call is put back at the call site as an IIFE. This
// happens after bindings are renamed (resolved where the function is
// declared), so hoisting an IIFE into a named function only compares equal if
// every free variable still refers to the same binding.
export function canonicalize(code, { normalizeSyntax = false, ignoreDeclarationKind = false, inlineSingleUseFunctions = false } = {}) {
    const ast = parse(code, { sourceType: 'script', errorRecovery: false, allowReturnOutsideFunction: true });
    if (normalizeSyntax) {
        traverse(ast, {
            BinaryExpression(path) {
                const { node } = path;
                if (EQUALITY.has(node.operator) && isPlainLiteral(node.right) && !isPlainLiteral(node.left)) {
                    [node.left, node.right] = [node.right, node.left];
                }
            },
            VariableDeclaration(path) {
                if (ignoreDeclarationKind) path.node.kind = 'let';
                // `let a = 1, b = a` is `let a = 1; let b = a` (outside loop heads).
                const loopHead = path.parentPath.isFor() && path.key !== 'body';
                if (path.node.declarations.length > 1 && !loopHead && path.inList) {
                    path.replaceWithMultiple(path.node.declarations.map((d) => t.variableDeclaration(path.node.kind, [d])));
                }
            },
            ReturnStatement(path) {
                // `return (a, b)` is `a; return b`; `return void x` is `x; return`.
                let arg = path.node.argument;
                const statements = [];
                if (t.isSequenceExpression(arg)) {
                    statements.push(...arg.expressions.slice(0, -1).map((e) => t.expressionStatement(e)));
                    arg = arg.expressions.at(-1);
                }
                if (t.isUnaryExpression(arg, { operator: 'void' })) {
                    if (!isPlainLiteral(arg.argument)) statements.push(t.expressionStatement(arg.argument));
                    arg = null;
                }
                if (statements.length === 0 && arg === path.node.argument) return;
                statements.push(t.returnStatement(arg));
                if (path.inList) path.replaceWithMultiple(statements);
                else path.replaceWith(t.blockStatement(statements));
            },
        });
    }
    // Give every binding a unique token, resolved scope-aware where it is declared.
    const bindings = [];
    let program;
    traverse(ast, {
        Program(path) {
            program = path;
        },
        Scope(path) {
            for (const [name, binding] of Object.entries(path.scope.bindings)) {
                if (!bindings.some((b) => b.binding === binding)) bindings.push({ name, binding, scope: path.scope });
            }
        },
    });
    bindings.forEach((b, i) => b.scope.rename(b.name, `$u${i}$`));

    if (inlineSingleUseFunctions) inlineSingleUse(program);

    let out = generate(ast, { comments: false, compact: true }).code;
    if (normalizeSyntax) {
        out = transformSync(out, { minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, legalComments: 'none' }).code;
        // esbuild deletes unused functions as dead code; a change inside one
        // would then go unnoticed, so refuse to compare rather than pass.
        const dropped = countFunctions(ast) - countFunctions(parse(out, { sourceType: 'script', allowReturnOutsideFunction: true }));
        if (dropped > 0) throw new Error(`esbuild dropped ${dropped} unused function(s); equivalence can't be checked`);
    }
    // Number tokens by first appearance, so the result doesn't depend on
    // where (or in which order) things were declared.
    const order = new Map();
    return out.replace(/\$u(\d+)\$/g, (token) => {
        if (!order.has(token)) order.set(token, `$${order.size}`);
        return order.get(token);
    });
}

// Repeatedly replaces `function f(..) {..}` + its single call `f(..)` with
// `(function (..) {..})(..)`. Purely syntactic: names were already made unique.
function inlineSingleUse(program) {
    for (let changed = true; changed;) {
        changed = false;
        program.scope.crawl();
        program.traverse({
            FunctionDeclaration(path) {
                if (changed) return;
                const binding = path.parentPath.scope.getBinding(path.node.id.name);
                if (!binding || binding.constantViolations.length || binding.referencePaths.length !== 1) return;
                const ref = binding.referencePaths[0];
                if (!ref.parentPath.isCallExpression() || ref.parent.callee !== ref.node) return;
                if (ref.findParent((p) => p === path)) return; // recursive
                const { params, body, generator, async } = path.node;
                ref.replaceWith(t.functionExpression(null, params, body, generator, async));
                path.remove();
                changed = true;
            },
        });
    }
}

// Returns null when equivalent, otherwise a short excerpt around the first difference.
export function compareCanonical(before, after, options) {
    const a = canonicalize(before, options);
    const b = canonicalize(after, options);
    if (a === b) return null;
    let i = 0;
    while (a[i] === b[i]) i += 1;
    return { offset: i, before: a.slice(Math.max(0, i - 200), i + 200), after: b.slice(Math.max(0, i - 200), i + 200) };
}

// Compares two scripts of the form `(() => { ...statements })();` statement by
// statement, ignoring the order of top-level declarations: declarations are
// matched by the name(s) they declare, and every other statement (e.g. a try
// block or the startup call) must appear in the same relative order. Each
// statement is canonicalized on its own, so references to other top-level
// names are compared by name. Use for module splits, where a bundler reorders
// declarations; it is only sound if top-level initializers are side-effect
// free, which `impureInitializers()` reports.
export function compareTopLevel(before, after, options = {}) {
    const a = topLevelStatements(before, options);
    const b = topLevelStatements(after, options);
    const problems = [];
    for (const key of new Set([...a.keys(), ...b.keys()])) {
        if (!a.has(key)) problems.push(`only after: ${key}`);
        else if (!b.has(key)) problems.push(`only before: ${key}`);
        else if (a.get(key) !== b.get(key)) problems.push(`differs: ${key}`);
    }
    return problems.length ? problems : null;
}

function iifeStatements(code) {
    const ast = parse(code, { sourceType: 'script' });
    const main = ast.program.body.find((s) => t.isExpressionStatement(s) && t.isCallExpression(s.expression));
    const callee = main?.expression.callee;
    if (!t.isFunction(callee)) throw new Error('Expected a top-level IIFE');
    return { body: callee.body.body };
}

// Each statement is canonicalized as a script of its own, not wrapped in a
// function: esbuild drops unused declarations inside functions as dead code,
// which would hide their bodies from the comparison.
function topLevelStatements(code, options) {
    const { body } = iifeStatements(code);
    const statements = new Map();
    let other = 0;
    for (const node of body) {
        if (t.isVariableDeclaration(node)) {
            for (const d of node.declarations) {
                const text = generate(t.variableDeclaration('let', [d]), { comments: false }).code;
                statements.set(`var ${d.id.name}`, canonicalize(text, { ...options, ignoreDeclarationKind: true }));
            }
        } else {
            const key = t.isFunctionDeclaration(node) ? `function ${node.id.name}` : `statement #${other++} (${node.type})`;
            statements.set(key, canonicalize(generate(node, { comments: false }).code, options));
        }
    }
    return statements;
}

// Top-level variable initializers that could have side effects (anything but
// literals, object/array literals of those, and `new Map()` / `new Set()`).
export function impureInitializers(code) {
    const pure = (n) => !n || isPlainLiteral(n) || t.isIdentifier(n, { name: 'undefined' }) ||
        (t.isUnaryExpression(n) && pure(n.argument)) ||
        (t.isObjectExpression(n) && n.properties.every((p) => t.isObjectProperty(p) && !p.computed && pure(p.value))) ||
        (t.isArrayExpression(n) && n.elements.every(pure)) ||
        (t.isNewExpression(n) && t.isIdentifier(n.callee) && ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(n.callee.name) && n.arguments.length === 0);
    return iifeStatements(code).body
        .filter((n) => t.isVariableDeclaration(n))
        .flatMap((n) => n.declarations)
        .filter((d) => !pure(d.init))
        .map((d) => d.id.name);
}

function countFunctions(ast) {
    let count = 0;
    traverse(ast, { Function() { count += 1; } });
    return count;
}
