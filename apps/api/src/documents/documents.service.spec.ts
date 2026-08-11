import { BadRequestException, ConflictException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { StorageService } from '../storage/storage.service';
import { ContentNodeUsabilityService } from '../curriculum/content-node-usability.service';
import { DocumentsAccessPolicy } from './documents-access.policy';
import { DocumentsService } from './documents.service';

function adminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1', title: 'Lesson plan', description: null,
    status: DocumentStatus.UPLOADING, sizeBytes: null, contentType: null,
    failureReason: null, createdAt: new Date(), contentNodeId: 'node-1',
    node: { title: 'Fractions', curriculumId: 'curriculum-1', curriculum: { gradeLevelId: 'g5', subjectId: 'maths' } },
    ...overrides,
  };
}

describe('DocumentsService', () => {
  const prisma = {
    document: {
      create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const storage = {
    createPresignedUpload: jest.fn(), statObject: jest.fn(), deletePrefix: jest.fn(),
  };
  const nodeUsability = { assertNodeUsable: jest.fn() };
  const service = new DocumentsService(
    prisma as unknown as PrismaService,
    { resolve: jest.fn() } as unknown as ActorContentScopeService,
    { canRead: jest.fn() } as unknown as DocumentsAccessPolicy,
    storage as unknown as StorageService,
    nodeUsability as unknown as ContentNodeUsabilityService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    nodeUsability.assertNodeUsable.mockResolvedValue(undefined);
    prisma.document.create.mockResolvedValue({ id: 'document-1' });
    prisma.document.update.mockResolvedValue(adminRow());
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    storage.createPresignedUpload.mockResolvedValue({ url: 'https://storage.test/put', key: 'documents/document-1/source.pdf', expiresInSecs: 900 });
  });

  it('creates an UPLOADING row and presigns its namespaced source key', async () => {
    const ticket = await service.create({ title: 'Lesson plan', contentNodeId: 'node-1', contentType: 'application/pdf', sizeBytes: 100 });
    expect(nodeUsability.assertNodeUsable).toHaveBeenCalledWith('node-1', 'Documents');
    expect(storage.createPresignedUpload).toHaveBeenCalledWith('documents/document-1/source.pdf', 'application/pdf');
    expect(ticket.uploadUrl).toBe('https://storage.test/put');
  });

  it('persists a failure reason before rejecting a missing upload', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 'document-1', status: DocumentStatus.UPLOADING, sourceKey: 'documents/document-1/source.pdf' });
    storage.statObject.mockResolvedValue(null);
    await expect(service.markUploaded('document-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'document-1' }, data: { status: DocumentStatus.FAILED, failureReason: 'No file was uploaded for this document' } });
  });

  it('does not issue an upload URL that could replace a ready document', async () => {
    prisma.document.findUnique.mockResolvedValue({ ...adminRow({ status: DocumentStatus.READY }), sourceKey: 'documents/document-1/source.pdf' });
    await expect(service.createUploadUrl('document-1', { contentType: 'application/pdf', sizeBytes: 100 })).rejects.toBeInstanceOf(ConflictException);
    expect(storage.createPresignedUpload).not.toHaveBeenCalled();
  });
});
