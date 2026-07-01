import fs from 'node:fs';
import path from 'node:path';

const messageCatalogOrderRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require localized message catalogs to match the default catalog key set and order.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          referenceFile: {
            type: 'string',
          },
          referenceObjectName: {
            type: 'string',
          },
          targetObjectName: {
            type: 'string',
          },
        },
        required: ['referenceObjectName', 'targetObjectName'],
      },
    ],
    messages: {
      extraCatalogKey:
        '{{targetObjectName}} contains message key "{{key}}" that is not present in {{referenceObjectName}}.',
      missingCatalogKey: '{{targetObjectName}} must include message key "{{key}}" from {{referenceObjectName}}.',
      missingCatalogObject: 'Message catalog object "{{objectName}}" could not be found.',
      orderedCatalogKey:
        '{{targetObjectName}} key "{{actualKey}}" must be in the same position as "{{expectedKey}}" from {{referenceObjectName}}.',
      referenceFileReadFailed: 'Reference message catalog file "{{referenceFile}}" could not be read.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const catalogObjects = new Map();

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') {
          return;
        }

        if (node.id.name !== options.referenceObjectName && node.id.name !== options.targetObjectName) {
          return;
        }

        const objectExpression = unwrapExpression(node.init);

        if (objectExpression?.type === 'ObjectExpression') {
          catalogObjects.set(node.id.name, objectExpression);
        }
      },
      'Program:exit'(node) {
        const referenceKeys = getReferenceKeys(context, catalogObjects, options, node);
        const targetObject = catalogObjects.get(options.targetObjectName);

        if (!referenceKeys || !targetObject) {
          if (!targetObject) {
            reportMissingObject(context, node, options.targetObjectName);
          }

          return;
        }

        const targetKeys = getObjectPropertyKeys(targetObject);
        const targetKeySet = new Set(targetKeys.map((entry) => entry.key));
        const referenceKeySet = new Set(referenceKeys);
        const missingKey = referenceKeys.find((key) => !targetKeySet.has(key));
        const extraKey = targetKeys.find((entry) => !referenceKeySet.has(entry.key));

        if (missingKey) {
          context.report({
            node: targetObject,
            messageId: 'missingCatalogKey',
            data: {
              key: missingKey,
              referenceObjectName: options.referenceObjectName,
              targetObjectName: options.targetObjectName,
            },
          });
          return;
        }

        if (extraKey) {
          context.report({
            node: extraKey.node,
            messageId: 'extraCatalogKey',
            data: {
              key: extraKey.key,
              referenceObjectName: options.referenceObjectName,
              targetObjectName: options.targetObjectName,
            },
          });
          return;
        }

        for (let index = 0; index < referenceKeys.length; index += 1) {
          if (targetKeys[index]?.key !== referenceKeys[index]) {
            context.report({
              node: targetKeys[index]?.node ?? targetObject,
              messageId: 'orderedCatalogKey',
              data: {
                actualKey: targetKeys[index]?.key ?? '',
                expectedKey: referenceKeys[index],
                referenceObjectName: options.referenceObjectName,
                targetObjectName: options.targetObjectName,
              },
            });
            return;
          }
        }
      },
    };
  },
};

export const tiltyI18nPlugin = {
  rules: {
    'message-catalog-order': messageCatalogOrderRule,
  },
};

function getReferenceKeys(context, catalogObjects, options, node) {
  if (!options.referenceFile) {
    const referenceObject = catalogObjects.get(options.referenceObjectName);

    if (!referenceObject) {
      reportMissingObject(context, node, options.referenceObjectName);
      return null;
    }

    return getObjectPropertyKeys(referenceObject).map((entry) => entry.key);
  }

  const referencePath = path.resolve(process.cwd(), options.referenceFile);

  try {
    return extractObjectKeys(fs.readFileSync(referencePath, 'utf8'), options.referenceObjectName);
  } catch {
    context.report({
      node,
      messageId: 'referenceFileReadFailed',
      data: {
        referenceFile: options.referenceFile,
      },
    });
    return null;
  }
}

function reportMissingObject(context, node, objectName) {
  context.report({
    node,
    messageId: 'missingCatalogObject',
    data: {
      objectName,
    },
  });
}

function unwrapExpression(expression) {
  let currentExpression = expression;

  while (
    currentExpression?.type === 'TSAsExpression' ||
    currentExpression?.type === 'TSSatisfiesExpression' ||
    currentExpression?.type === 'TSNonNullExpression' ||
    currentExpression?.type === 'TSInstantiationExpression'
  ) {
    currentExpression = currentExpression.expression;
  }

  return currentExpression;
}

function getObjectPropertyKeys(objectExpression) {
  return objectExpression.properties.flatMap((property) => {
    if (property.type !== 'Property' || property.computed) {
      return [];
    }

    const key = getPropertyKey(property.key);

    return key ? [{ key, node: property.key }] : [];
  });
}

function getPropertyKey(keyNode) {
  if (keyNode.type === 'Identifier') {
    return keyNode.name;
  }

  if (keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
    return keyNode.value;
  }

  return null;
}

function extractObjectKeys(sourceText, objectName) {
  const assignmentIndex = sourceText.indexOf(`const ${objectName} =`);

  if (assignmentIndex < 0) {
    throw new Error(`Missing ${objectName}`);
  }

  const objectStartIndex = sourceText.indexOf('{', assignmentIndex);

  if (objectStartIndex < 0) {
    throw new Error(`Missing ${objectName} object`);
  }

  const objectSource = sourceText.slice(objectStartIndex, findMatchingBraceIndex(sourceText, objectStartIndex) + 1);

  return [...objectSource.matchAll(/^\s*'([^']+)'\s*:/gm)].map((match) => match[1]);
}

function findMatchingBraceIndex(sourceText, startIndex) {
  let depth = 0;
  let quote = null;
  let escaping = false;

  for (let index = startIndex; index < sourceText.length; index += 1) {
    const character = sourceText[index];

    if (quote) {
      if (escaping) {
        escaping = false;
      } else if (character === '\\') {
        escaping = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error('Unterminated object literal');
}
