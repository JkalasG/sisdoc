import { Inject, Injectable } from '@nestjs/common';
import { CONTACTS_PORT, Contact, ContactsPort } from '../domain/ports';

export const CONTACTS_LIMIT = 30;

@Injectable()
export class ListContactsUseCase {
  constructor(@Inject(CONTACTS_PORT) private readonly contacts: ContactsPort) {}

  execute(input: { userId: string; q?: string }): Promise<Contact[]> {
    const q = input.q?.trim().slice(0, 100) || undefined;
    return this.contacts.search({ exceptUserId: input.userId, q, limit: CONTACTS_LIMIT });
  }
}
