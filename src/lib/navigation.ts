export type Role = "ADMIN" | "OPERATOR" | "DEV";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  iconName: string;
  badge?: string;
  exact?: boolean;
}

export interface NavigationGroup {
  id: string;
  title?: string;
  items: NavigationItem[];
}

export function getNavigationGroups(role: Role): NavigationGroup[] {
  const groups: NavigationGroup[] = [];

  // Main / Core links
  const mainItems: NavigationItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      iconName: "dashboard",
      exact: true,
    },
    {
      id: "proposals",
      label: "Proposals",
      href: "/dashboard/proposals",
      iconName: "proposals",
    },
  ];

  groups.push({
    id: "main",
    items: mainItems,
  });

  // Action shortcuts
  const actionItems: NavigationItem[] = [
    {
      id: "new-questionnaire",
      label: "New Questionnaire",
      href: "/dashboard/new",
      iconName: "plus",
    },
    {
      id: "generate-ai",
      label: "Generate with AI",
      href: "/dashboard/generate",
      iconName: "sparkles",
    },
  ];

  groups.push({
    id: "actions",
    title: "Create",
    items: actionItems,
  });

  // Master Data (ADMIN & DEV)
  if (role === "ADMIN" || role === "DEV") {
    groups.push({
      id: "masters",
      title: "Master Data",
      items: [
        {
          id: "question-masters",
          label: "Question Masters",
          href: "/admin/question-masters",
          iconName: "database",
        },
        {
          id: "option-sets",
          label: "Option Sets",
          href: "/admin/option-sets",
          iconName: "list",
        },
      ],
    });
  }

  // Developer (ADMIN & DEV)
  if (role === "ADMIN" || role === "DEV") {
    groups.push({
      id: "dev",
      title: "Developer",
      items: [
        {
          id: "api-keys",
          label: "API Keys",
          href: "/admin/api-keys",
          iconName: "key",
        },
      ],
    });
  }

  // Administration (ADMIN only)
  if (role === "ADMIN") {
    groups.push({
      id: "admin",
      title: "Administration",
      items: [
        {
          id: "orgs",
          label: "Organizations",
          href: "/admin/orgs",
          iconName: "building",
        },
        {
          id: "users",
          label: "Users",
          href: "/admin/users",
          iconName: "users",
        },
      ],
    });
  }

  return groups;
}
