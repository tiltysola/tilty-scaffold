const moduleTypeOrderRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require module type declarations to follow imports and precede runtime declarations.',
    },
    schema: [],
    messages: {
      importAfterRuntime: 'Imports must be placed before type, interface, and runtime declarations.',
      typeAfterRuntime: 'Type and interface declarations must be placed after imports and before runtime declarations.',
    },
  },
  create(context) {
    return {
      Program(node) {
        let highestOrderRank = -1;

        for (const statement of node.body) {
          const orderKind = getOrderKind(statement);

          if (!orderKind) {
            continue;
          }

          if (getOrderRank(orderKind) < highestOrderRank) {
            context.report({
              node: statement,
              messageId: orderKind === 'import' ? 'importAfterRuntime' : 'typeAfterRuntime',
            });
            continue;
          }

          highestOrderRank = getOrderRank(orderKind);
        }
      },
    };
  },
};

export const tiltyModuleOrderPlugin = {
  rules: {
    'module-types-before-runtime': moduleTypeOrderRule,
  },
};

function getOrderKind(statement) {
  if (statement.type === 'ImportDeclaration') {
    return 'import';
  }

  if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
    return statement.declaration ? getOrderKind(statement.declaration) : null;
  }

  if (isTypeDeclaration(statement)) {
    return 'type';
  }

  if (isRuntimeDeclaration(statement)) {
    return 'runtime';
  }

  return null;
}

function getOrderRank(orderKind) {
  if (orderKind === 'import') {
    return 0;
  }

  if (orderKind === 'type') {
    return 1;
  }

  return 2;
}

function isTypeDeclaration(statement) {
  return statement.type === 'TSInterfaceDeclaration' || statement.type === 'TSTypeAliasDeclaration';
}

function isRuntimeDeclaration(statement) {
  return (
    statement.type === 'ClassDeclaration' ||
    statement.type === 'ExpressionStatement' ||
    statement.type === 'FunctionDeclaration' ||
    statement.type === 'TSDeclareFunction' ||
    statement.type === 'TSEnumDeclaration' ||
    statement.type === 'TSModuleDeclaration' ||
    statement.type === 'VariableDeclaration' ||
    statement.type.endsWith('Statement')
  );
}
