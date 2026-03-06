/**
 * blueprintValidator.js - Blueprint Cross-Validator
 *
 * Sits between the Architect and Planner.
 * Its only job: find contradictions in the blueprint BEFORE
 * any code is written. Catch problems early = save tokens later.
 *
 * Checks:
 * 1. Every API endpoint references a table that exists in the schema
 * 2. Every frontend page calls APIs that actually exist
 * 3. Every foreign key references an existing table and field
 * 4. Every entity from the spec has at least one DB table
 * 5. Auth/role requirements are consistent
 * 6. No orphan tables
 *
 * This is pure deterministic logic -- zero LLM calls.
 */

const MAX_VALIDATION_CYCLES = 2;

export async function blueprintValidatorNode(state) {
    console.log("\n[Blueprint Validator] Cross-validating architecture...\n");

    const { dbSchema, apiEndpoints, frontendPages, entities } = state.blueprint;
    const currentCycles = state.blueprintValidation?.validationCycles || 0;

    const issues = [];

    // CHECK 1: Every entity has a DB table
    if (entities && dbSchema?.tables) {
        const tableNames = new Set(
            dbSchema.tables.map(t => t.name.toLowerCase().replace(/s$/, ""))
        );
        dbSchema.tables.forEach(t => tableNames.add(t.name.toLowerCase()));

        for (const entity of entities) {
            const entityName = entity.name.toLowerCase();
            const hasTable = tableNames.has(entityName) ||
                tableNames.has(entityName + "s") ||
                tableNames.has(entityName.replace(/y$/, "ie") + "s");
            if (!hasTable) {
                issues.push({
                    type: "missing_table",
                    severity: "error",
                    fixTarget: "architectStep2",
                    message: `Entity "${entity.name}" has no matching DB table. Tables: [${dbSchema.tables.map(t => t.name).join(", ")}]`,
                });
            }
        }
    }

    // CHECK 2: Foreign keys reference existing tables
    if (dbSchema?.tables) {
        const tableNameSet = new Set(dbSchema.tables.map(t => t.name.toLowerCase()));

        for (const table of dbSchema.tables) {
            if (table.foreignKeys) {
                for (const fk of table.foreignKeys) {
                    const refMatch = fk.references?.match(/^(\w+)\(/);
                    if (refMatch) {
                        const refTable = refMatch[1].toLowerCase();
                        if (!tableNameSet.has(refTable)) {
                            issues.push({
                                type: "invalid_foreign_key",
                                severity: "error",
                                fixTarget: "architectStep2",
                                message: `Table "${table.name}" has FK referencing "${fk.references}" but table "${refTable}" does not exist.`,
                            });
                        }
                    }
                }
            }
        }
    }

    // CHECK 3: API endpoints reference existing tables
    if (apiEndpoints && dbSchema?.tables) {
        const tableNameSet = new Set(dbSchema.tables.map(t => t.name.toLowerCase()));

        for (const endpoint of apiEndpoints) {
            if (endpoint.relatedTable) {
                const related = endpoint.relatedTable.toLowerCase();
                if (!tableNameSet.has(related)) {
                    issues.push({
                        type: "orphan_endpoint",
                        severity: "error",
                        fixTarget: "architectStep3",
                        message: `API "${endpoint.method} ${endpoint.path}" references table "${endpoint.relatedTable}" which doesn't exist.`,
                    });
                }
            }
        }
    }

    // CHECK 4: Frontend pages reference existing APIs
    if (frontendPages && apiEndpoints) {
        const apiPaths = new Set(
            (Array.isArray(apiEndpoints) ? apiEndpoints : []).map(e => e.path?.toLowerCase())
        );

        for (const page of frontendPages) {
            if (page.components) {
                for (const comp of page.components) {
                    if (comp.apiCalls) {
                        for (const apiCall of comp.apiCalls) {
                            const normalized = apiCall.toLowerCase().replace(/\/:\w+/g, "/:param");
                            const exists = [...apiPaths].some(path => {
                                const normPath = path?.replace(/\/:\w+/g, "/:param");
                                return normPath === normalized || path === apiCall.toLowerCase();
                            });
                            if (!exists) {
                                issues.push({
                                    type: "missing_api",
                                    severity: "warning",
                                    fixTarget: "architectStep3",
                                    message: `Page "${page.name}" -> Component "${comp.name}" calls "${apiCall}" but no matching API endpoint exists.`,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // CHECK 5: Auth consistency
    if (apiEndpoints && frontendPages) {
        const authEndpoints = new Set(
            (Array.isArray(apiEndpoints) ? apiEndpoints : [])
                .filter(e => e.requiresAuth)
                .map(e => e.path?.toLowerCase())
        );

        for (const page of frontendPages) {
            if (page.components) {
                for (const comp of page.components) {
                    if (comp.apiCalls) {
                        const callsAuthApi = comp.apiCalls.some(c => authEndpoints.has(c.toLowerCase()));
                        if (callsAuthApi && !page.requiresAuth) {
                            issues.push({
                                type: "auth_mismatch",
                                severity: "warning",
                                fixTarget: "architectStep4",
                                message: `Page "${page.name}" calls auth-required API but page.requiresAuth is false.`,
                            });
                        }
                    }
                }
            }
        }
    }

    // CHECK 6: No orphan tables
    if (dbSchema?.tables && apiEndpoints) {
        const referencedTables = new Set(
            (Array.isArray(apiEndpoints) ? apiEndpoints : [])
                .map(e => e.relatedTable?.toLowerCase())
                .filter(Boolean)
        );

        for (const table of dbSchema.tables) {
            const name = table.name.toLowerCase();
            const isJunction = name.includes("_") && !["created_at", "updated_at"].some(f => name.includes(f));

            if (!referencedTables.has(name) && !isJunction) {
                issues.push({
                    type: "orphan_table",
                    severity: "warning",
                    fixTarget: "architectStep3",
                    message: `Table "${table.name}" exists but no API endpoint references it.`,
                });
            }
        }
    }

    // DECIDE: Valid or route back
    const errors = issues.filter(i => i.severity === "error");
    const warnings = issues.filter(i => i.severity === "warning");

    if (issues.length === 0) {
        console.log("   PASSED -- all cross-checks passed!");
        return {
            blueprintValidation: {
                isValid: true,
                issues: [],
                validationCycles: currentCycles + 1,
            },
            currentPhase: "planner",
        };
    }

    if (currentCycles >= MAX_VALIDATION_CYCLES) {
        console.log(`   Max validation cycles (${MAX_VALIDATION_CYCLES}) reached. Proceeding with warnings.`);
        console.log(`   ${errors.length} errors, ${warnings.length} warnings (unresolved)`);
        issues.forEach(i => console.log(`   [${i.severity}] ${i.message}`));
        return {
            blueprintValidation: {
                isValid: true,
                issues: issues,
                validationCycles: currentCycles + 1,
            },
            currentPhase: "planner",
        };
    }

    console.log(`   FAILED -- ${errors.length} errors, ${warnings.length} warnings (cycle ${currentCycles + 1}/${MAX_VALIDATION_CYCLES})`);
    issues.forEach(i => console.log(`   [${i.severity}] ${i.message}`));

    return {
        blueprintValidation: {
            isValid: false,
            issues: issues,
            validationCycles: currentCycles + 1,
        },
    };
}

/**
 * Determine which architect step to route back to based on issues.
 */
export function blueprintValidatorRouter(state) {
    const validation = state.blueprintValidation;

    if (validation?.isValid) {
        return "__end__";
    }

    const errors = validation?.issues?.filter(i => i.severity === "error") || [];

    if (errors.length > 0) {
        const target = errors[0].fixTarget;
        console.log(`   Routing back to ${target} for fixes...\n`);
        return target;
    }

    const targets = (validation?.issues || []).map(i => i.fixTarget);
    const targetCounts = {};
    targets.forEach(t => { targetCounts[t] = (targetCounts[t] || 0) + 1; });
    const topTarget = Object.entries(targetCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    if (topTarget) {
        console.log(`   Routing back to ${topTarget} for fixes...\n`);
        return topTarget;
    }

    return "__end__";
}
