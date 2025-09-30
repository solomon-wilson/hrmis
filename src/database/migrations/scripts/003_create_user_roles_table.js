export const createUserRolesTable = {
    id: '003',
    name: 'Create user_roles table',
    async up(client) {
        const query = `
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, role_id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
    `;
        await client.query(query);
    },
    async down(client) {
        const query = `
      DROP TABLE IF EXISTS user_roles CASCADE;
    `;
        await client.query(query);
    }
};
