export interface AdminCaregiver {
  id: string
  name: string
  email: string
  status: string
  lastLoginAt: string | null
  patientCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminUser {
  role: string
}

export interface AdminLoginResponse {
  token: string
  admin: AdminUser
}

export interface AdminPatient {
  id: string
  name: string
  deviceId: string
  phoneNumber: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminCaregiverDetail {
  id: string
  name: string
  email: string
  status: string
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  patients: AdminPatient[]
}
