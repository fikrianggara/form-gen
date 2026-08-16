-- TKT-022: Invitation.responseId becomes a real FK relation to Response.
-- onDelete: SetNull — deleting a response detaches its invitations
-- (the old manual updateMany detach in response-admin.service.ts is kept
-- as defense-in-depth; the constraint guarantees no dangling refs).

-- CreateIndex
CREATE INDEX "Invitation_responseId_idx" ON "Invitation"("responseId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE SET NULL ON UPDATE CASCADE;
