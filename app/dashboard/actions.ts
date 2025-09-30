export async function getDashboardData() {
  return {
    user: {
      name: 'John Doe',
      email: 'john.doe@example.com',
    },
    team: {
      count: 3,
    },
  };
}

export async function getProfileData() {
  return {
    personal: {
      name: 'John Doe',
      email: 'john.doe@example.com',
    },
    job: {
      title: 'Software Engineer',
      department: 'Technology',
      manager: 'Jane Smith',
    },
    documents: [
      {
        name: 'Offer Letter',
        url: '#',
      },
      {
        name: 'W-4',
        url: '#',
      },
    ],
  };
}
