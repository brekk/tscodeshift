import { stripIndent } from 'common-tags';
import * as ts from 'typescript';
import { applyTransforms } from './transform';
import * as types from './types';

test('run identifiers transform', () => {
  /**
   * Example tscodeshift transformer. Simply reverses the names of all
   * identifiers.
   */
  function identifiersTransform(file: types.File, api: types.API): string {
    const t = api.tscodeshift;

    return t(file.source)
      .find(ts.SyntaxKind.Identifier)
      .replaceWith(
        node => ts.createIdentifier(node.text.split('').reverse().join(''))
      )
      .toSource();
  }
  const source = stripIndent`
    export function test(): void {
      var abc;
    }
  `;
  const expected = stripIndent`
    export function tset(): void {
      var cba;
    }
  `;

  const actual = applyTransforms('path.ts', source, [identifiersTransform]);

  expect(actual).toBe(expected);
});

it('convert function expressions to arrow function expressions', () => {
  function arrowTransform(file: types.File, api: types.API): string {
    const t = api.tscodeshift;

    return t(file.source)
      .find(ts.SyntaxKind.CallExpression, {
        expression: {
          kind: ts.SyntaxKind.PropertyAccessExpression,
          expression: {
            kind: ts.SyntaxKind.FunctionExpression
          },
          name: {
            kind: ts.SyntaxKind.Identifier,
            text: 'bind'
          }
        }
      })
      .filter(node => {
        const hasNoName = !((node.expression as ts.PropertyAccessExpression)
          .expression as ts.FunctionExpression).name;
        const isBoundToThis = node.arguments
          && node.arguments.length === 1
          && node.arguments[0].kind === ts.SyntaxKind.ThisKeyword;
        return hasNoName && isBoundToThis;
      })
      .replaceWith(node => {
        const fn = (node.expression as ts.PropertyAccessExpression)
          .expression as ts.FunctionExpression;
        return ts.createArrowFunction(
          undefined /* modifiers */,
          fn.typeParameters,
          fn.parameters,
          fn.type,
          ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          fn.body
        );
      })
      .toSource();
  }

  const source = `
    const a = function() {};
    const b = function <T>(): T {}.bind(this);
    const c = function name() {}.bind(this);
  `;
  const expected = `
    const a = function() {};
    const b = <T>(): T=>{};
    const c = function name() {}.bind(this);
  `;

  const actual = applyTransforms('path.ts', source, [arrowTransform]);

  expect(actual).toBe(expected);
});

it('convert var declarations to let declarations', () => {
  function varTransform(file: types.File, api: types.API): string {
    const t = api.tscodeshift;

    return t(file.source)
      .find(ts.SyntaxKind.VariableDeclarationList)
      .filter(node => (
        // tslint:disable-next-line no-bitwise
        !(node.flags & ts.NodeFlags.Const
        // tslint:disable-next-line no-bitwise
        || node.flags & ts.NodeFlags.Let)
      ))
      .replaceWith(node => {
        return ts.createVariableDeclarationList(
          node.declarations,
          // tslint:disable-next-line no-bitwise
          node.flags | ts.NodeFlags.Let
        );
      })
      .toSource();
  }

  const source = `
    var a: number = 1;
  `;
  const expected = `
    let a: number = 1;
  `;

  const actual = applyTransforms('path.ts', source, [varTransform]);

  expect(actual).toBe(expected);
});
