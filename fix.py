import sys

with open('src/routes/v1/matchRoutes.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the end of initialize route
start_idx = -1
for i, line in enumerate(lines):
    if 'console.error("[match/set/initialize] failed", error);' in line:
        start_idx = i - 1
        break

if start_idx == -1:
    print('Could not find start idx')
    sys.exit(1)

# Write out the good lines
good_lines = lines[:start_idx]

# Append the correct block
good_lines.append('        } catch (error) {\n')
good_lines.append('          console.error("[match/set/initialize] failed", error);\n')
good_lines.append('          return sendResponse({\n')
good_lines.append('            success: false,\n')
good_lines.append('            message: "Failed to initialize set",\n')
good_lines.append('          });\n')
good_lines.append('        }\n')
good_lines.append('      },\n')
good_lines.append('      {\n')
good_lines.append('        body: t.Object({\n')
good_lines.append('          matchId: t.String({ format: "uuid" }),\n')
good_lines.append('          setNumber: t.Number(),\n')
good_lines.append('        }),\n')
good_lines.append('      },\n')
good_lines.append('    )\n')
good_lines.append('    .get(\n')
good_lines.append('      "/scorer-matches",\n')
good_lines.append('      async ({ user, db }) => {\n')
good_lines.append('        try {\n')
good_lines.append('          const matches = await db.query.matchTable.findMany({\n')
good_lines.append('            where: ((table: any, { eq }: any) => eq(table.scorer, user.id)) as any,\n')
good_lines.append('            with: {\n')
good_lines.append('              sets: true,\n')
good_lines.append('              event: {\n')
good_lines.append('                with: {\n')
good_lines.append('                  tournament: true,\n')
good_lines.append('                },\n')
good_lines.append('              },\n')
good_lines.append('              teamAData: {\n')
good_lines.append('                with: {\n')
good_lines.append('                  participants: {\n')
good_lines.append('                    with: {\n')
good_lines.append('                      user: true,\n')
good_lines.append('                    },\n')
good_lines.append('                  },\n')
good_lines.append('                },\n')
good_lines.append('              },\n')
good_lines.append('              teamBData: {\n')
good_lines.append('                with: {\n')
good_lines.append('                  participants: {\n')
good_lines.append('                    with: {\n')
good_lines.append('                      user: true,\n')
good_lines.append('                    },\n')
good_lines.append('                  },\n')
good_lines.append('                },\n')
good_lines.append('              },\n')
good_lines.append('            },\n')
good_lines.append('          });\n')
good_lines.append('\n')
good_lines.append('          return sendResponse({\n')
good_lines.append('            success: true,\n')
good_lines.append('            message: "Scorer matches fetched successfully",\n')
good_lines.append('            data: matches,\n')
good_lines.append('          });\n')
good_lines.append('        } catch (error) {\n')
good_lines.append('          console.error("[match/scorer-matches] failed:", error);\n')
good_lines.append('          return sendResponse({\n')
good_lines.append('            success: false,\n')
good_lines.append('            message: "Failed to fetch scorer matches",\n')
good_lines.append('          });\n')
good_lines.append('        }\n')
good_lines.append('      },\n')
good_lines.append('    ),\n')
good_lines.append(');\n')

with open('src/routes/v1/matchRoutes.ts', 'w', encoding='utf-8') as f:
    f.writelines(good_lines)

print('Rewrite complete')
