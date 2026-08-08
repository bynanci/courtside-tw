package tw.basketball.magazine.media.processing;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/** Removes EXIF-bearing JPEG, PNG and WebP chunks without storing original metadata. */
public final class MediaMetadataSanitizer {
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xFF, (byte) 0xD8};
    private static final byte[] PNG_SIGNATURE = {
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    };

    public SanitizedMedia sanitize(ValidatedMedia media) {
        Objects.requireNonNull(media, "media");
        byte[] bytes = media.bytes();
        byte[] sanitized = sanitize(bytes);
        return new SanitizedMedia(media.assetId(), media.mimeType(), media.sha256(), sanitized);
    }

    public byte[] sanitize(byte[] bytes) {
        Objects.requireNonNull(bytes, "bytes");
        if (startsWith(bytes, JPEG_SIGNATURE)) {
            return sanitizeJpeg(bytes);
        }
        if (startsWith(bytes, PNG_SIGNATURE)) {
            return sanitizePng(bytes);
        }
        if (ascii(bytes, 0, 4, "RIFF") && ascii(bytes, 8, 4, "WEBP")) {
            return sanitizeWebp(bytes);
        }
        return bytes.clone();
    }

    private static byte[] sanitizeJpeg(byte[] input) {
        ByteArrayOutputStream output = new ByteArrayOutputStream(input.length);
        output.write(input, 0, 2);
        int index = 2;
        while (index < input.length) {
            if (unsigned(input[index]) != 0xFF) {
                output.write(input, index, input.length - index);
                break;
            }
            int markerStart = index;
            while (index < input.length && unsigned(input[index]) == 0xFF) {
                index++;
            }
            if (index >= input.length) {
                throw metadataFailure("truncated JPEG marker");
            }
            int marker = unsigned(input[index++]);
            if (marker == 0xDA || marker == 0xD9) {
                output.write(input, markerStart, input.length - markerStart);
                break;
            }
            if (marker == 0x01 || marker == 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
                output.write(input, markerStart, index - markerStart);
                continue;
            }
            if (index + 2 > input.length) {
                throw metadataFailure("truncated JPEG segment length");
            }
            int segmentLength = readBigEndianShort(input, index);
            if (segmentLength < 2 || index + segmentLength > input.length) {
                throw metadataFailure("invalid JPEG segment length");
            }
            boolean exif = marker == 0xE1
                    && segmentLength >= 8
                    && ascii(input, index + 2, 6, "Exif\0\0");
            if (!exif) {
                output.write(input, markerStart, index + segmentLength - markerStart);
            }
            index += segmentLength;
        }
        return output.toByteArray();
    }

    private static byte[] sanitizePng(byte[] input) {
        ByteArrayOutputStream output = new ByteArrayOutputStream(input.length);
        output.write(input, 0, PNG_SIGNATURE.length);
        int index = PNG_SIGNATURE.length;
        while (index < input.length) {
            if (index + 12 > input.length) {
                throw metadataFailure("truncated PNG chunk");
            }
            long chunkLength = readBigEndianInt(input, index);
            if (chunkLength > Integer.MAX_VALUE || chunkLength < 0) {
                throw metadataFailure("invalid PNG chunk length");
            }
            int chunkEnd = index + 12 + (int) chunkLength;
            if (chunkEnd < index || chunkEnd > input.length) {
                throw metadataFailure("PNG chunk exceeds content");
            }
            boolean exif = ascii(input, index + 4, 4, "eXIf");
            if (!exif) {
                output.write(input, index, chunkEnd - index);
            }
            boolean end = ascii(input, index + 4, 4, "IEND");
            index = chunkEnd;
            if (end) {
                if (index != input.length) {
                    throw metadataFailure("PNG contains trailing bytes");
                }
                break;
            }
        }
        return output.toByteArray();
    }

    private static byte[] sanitizeWebp(byte[] input) {
        ByteArrayOutputStream output = new ByteArrayOutputStream(input.length);
        output.write(input, 0, 12);
        int index = 12;
        while (index < input.length) {
            if (index + 8 > input.length) {
                throw metadataFailure("truncated WebP chunk");
            }
            long chunkLength = readLittleEndianInt(input, index + 4);
            if (chunkLength > Integer.MAX_VALUE || chunkLength < 0) {
                throw metadataFailure("invalid WebP chunk length");
            }
            int payloadEnd = index + 8 + (int) chunkLength;
            int chunkEnd = payloadEnd + ((int) chunkLength & 1);
            if (payloadEnd < index || chunkEnd < payloadEnd || chunkEnd > input.length) {
                throw metadataFailure("WebP chunk exceeds content");
            }
            if (!ascii(input, index, 4, "EXIF")) {
                output.write(input, index, chunkEnd - index);
            }
            index = chunkEnd;
        }
        byte[] sanitized = output.toByteArray();
        writeLittleEndianInt(sanitized, 4, sanitized.length - 8);
        return sanitized;
    }

    private static int readBigEndianShort(byte[] input, int offset) {
        return (unsigned(input[offset]) << 8) | unsigned(input[offset + 1]);
    }

    private static long readBigEndianInt(byte[] input, int offset) {
        return ((long) unsigned(input[offset]) << 24)
                | ((long) unsigned(input[offset + 1]) << 16)
                | ((long) unsigned(input[offset + 2]) << 8)
                | unsigned(input[offset + 3]);
    }

    private static long readLittleEndianInt(byte[] input, int offset) {
        return (long) unsigned(input[offset])
                | ((long) unsigned(input[offset + 1]) << 8)
                | ((long) unsigned(input[offset + 2]) << 16)
                | ((long) unsigned(input[offset + 3]) << 24);
    }

    private static void writeLittleEndianInt(byte[] output, int offset, int value) {
        output[offset] = (byte) value;
        output[offset + 1] = (byte) (value >>> 8);
        output[offset + 2] = (byte) (value >>> 16);
        output[offset + 3] = (byte) (value >>> 24);
    }

    private static boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private static boolean ascii(byte[] value, int offset, int length, String expected) {
        if (value.length < offset + length) {
            return false;
        }
        byte[] expectedBytes = expected.getBytes(StandardCharsets.ISO_8859_1);
        if (expectedBytes.length != length) {
            return false;
        }
        for (int index = 0; index < length; index++) {
            if (value[offset + index] != expectedBytes[index]) {
                return false;
            }
        }
        return true;
    }

    private static int unsigned(byte value) {
        return value & 0xFF;
    }

    private static MediaValidationException metadataFailure(String message) {
        return new MediaValidationException(MediaFailureReason.METADATA, message);
    }
}
