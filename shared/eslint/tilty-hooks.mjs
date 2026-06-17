export const reactHookGroups = [
  {
    name: 'state',
    hooks: ['useActionState', 'useOptimistic', 'useReducer', 'useState'],
  },
  {
    name: 'rate-limit',
    hooks: ['useDebounce', 'useThrottle'],
    patterns: ['^use.*(?:Debounce|Throttle)$'],
  },
  {
    name: 'ref',
    hooks: ['useImperativeHandle', 'useRef'],
  },
  {
    name: 'routing',
    hooks: [
      'useAsyncError',
      'useAsyncValue',
      'useBeforeUnload',
      'useBlocker',
      'useFetcher',
      'useFetchers',
      'useFormAction',
      'useHref',
      'useHistory',
      'useInRouterContext',
      'useLinkClickHandler',
      'useLoaderData',
      'useLocation',
      'useMatch',
      'useMatches',
      'useNavigate',
      'useNavigation',
      'useNavigationType',
      'useOutlet',
      'useOutletContext',
      'useParams',
      'useResolvedPath',
      'useRouteError',
      'useRouteLoaderData',
      'useRoutes',
      'useSearchParams',
      'useSubmit',
    ],
    patterns: [
      '^use.*(?:History|Href|Location|Match|Matches|Navigate|Navigation|Outlet|Params|Route|Router|SearchParams)$',
    ],
  },
  {
    fallback: true,
    name: 'setup',
  },
  {
    name: 'effect',
    hooks: ['useEffect', 'useInsertionEffect', 'useLayoutEffect'],
  },
  {
    name: 'side-effect',
    hooks: ['useAnimationFrame', 'useEventListener', 'useIdleCallback', 'useInterval', 'useRaf', 'useTimeout'],
    patterns: [
      '^use.*(?:AnimationFrame|EventListener|IdleCallback|Interval|MutationObserver|Raf|ResizeObserver|Timeout)$',
    ],
  },
];

const reactHookOrderRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require grouped, alphabetized React hook calls.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fallback: {
                  type: 'boolean',
                },
                hooks: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                name: {
                  type: 'string',
                },
                patterns: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
              },
              required: ['name'],
            },
          },
        },
      },
    ],
    messages: {
      orderedHook: '{{hook}} should be called before {{previousHook}}.',
      sortedHook: '{{hook}} should be sorted before {{previousHook}} within the {{group}} hook group.',
    },
  },
  create(context) {
    const groups = compileHookGroups(context.options[0]?.groups ?? reactHookGroups);

    function checkFunction(node) {
      if (!node.body || node.body.type !== 'BlockStatement') {
        return;
      }

      let latestHook = null;

      for (const statement of node.body.body) {
        for (const hook of getStatementHookCalls(statement)) {
          const group = getHookGroup(hook.name, groups);

          if (!group) {
            continue;
          }

          if (latestHook && group.index < latestHook.group.index) {
            context.report({
              node: hook.node,
              messageId: 'orderedHook',
              data: {
                hook: hook.name,
                previousHook: latestHook.name,
              },
            });
            continue;
          }

          if (latestHook && group.index === latestHook.group.index && hook.name.localeCompare(latestHook.name) < 0) {
            context.report({
              node: hook.node,
              messageId: 'sortedHook',
              data: {
                group: group.name,
                hook: hook.name,
                previousHook: latestHook.name,
              },
            });
            continue;
          }

          latestHook = {
            group,
            name: hook.name,
          };
        }
      }
    }

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
    };
  },
};

export const tiltyHooksPlugin = {
  rules: {
    'react-hook-order': reactHookOrderRule,
  },
};

function compileHookGroups(groups) {
  const compiledGroups = groups.map((group, index) => ({
    fallback: group.fallback === true,
    hooks: new Set(group.hooks ?? []),
    index,
    name: group.name,
    patterns: (group.patterns ?? []).map((pattern) => new RegExp(pattern)),
  }));

  return {
    fallbackGroup: compiledGroups.find((group) => group.fallback),
    matcherGroups: compiledGroups.filter((group) => !group.fallback),
  };
}

function getHookGroup(hookName, groups) {
  for (const group of groups.matcherGroups) {
    if (group.hooks.has(hookName) || group.patterns.some((pattern) => pattern.test(hookName))) {
      return group;
    }
  }

  return groups.fallbackGroup;
}

function getStatementHookCalls(statement) {
  if (statement.type === 'ExpressionStatement') {
    return getExpressionHookCall(statement.expression);
  }

  if (statement.type !== 'VariableDeclaration') {
    return [];
  }

  return statement.declarations.flatMap((declaration) =>
    declaration.init ? getExpressionHookCall(declaration.init) : [],
  );
}

function getExpressionHookCall(expression) {
  if (expression.type !== 'CallExpression') {
    return [];
  }

  const hookName = getHookName(expression.callee);

  return hookName ? [{ name: hookName, node: expression.callee }] : [];
}

function getHookName(callee) {
  if (callee.type === 'Identifier' && isHookName(callee.name)) {
    return callee.name;
  }

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    isHookName(callee.property.name)
  ) {
    return callee.property.name;
  }

  return null;
}

function isHookName(name) {
  return /^use[A-Z0-9]/.test(name);
}
