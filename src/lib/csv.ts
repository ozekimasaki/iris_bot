type MemberCsvRow = {
  userId: string;
  displayName: string;
  globalName: string;
  username: string;
};

function escapeCsvField(value: string) {
  const normalized = value.replaceAll('"', '""');
  return `"${normalized}"`;
}

export function buildMemberCsv(rows: MemberCsvRow[]) {
  const header = ['user_id', 'display_name', 'global_name', 'username'];
  const lines = rows.map((row) => [
    row.userId,
    row.displayName,
    row.globalName,
    row.username,
  ].map(escapeCsvField).join(','));

  return '\uFEFF' + [header.join(','), ...lines].join('\n');
}
