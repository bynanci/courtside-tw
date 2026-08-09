package tw.basketball.magazine.security;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

/** Rejects request bodies above the bounded JSON/API envelope. */
public final class RequestPayloadLimitFilter extends OncePerRequestFilter {
    private static final int PAYLOAD_TOO_LARGE = 413;
    private static final int READ_BUFFER_BYTES = 8192;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long contentLength = request.getContentLengthLong();
        if (contentLength > SecurityBoundaryPolicy.MAX_REQUEST_BODY_BYTES) {
            reject(response);
            return;
        }
        if (contentLength < 0) {
            byte[] body = readChunkedBody(request);
            if (body == null) {
                reject(response);
                return;
            }
            filterChain.doFilter(new CachedBodyRequest(request, body), response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static byte[] readChunkedBody(HttpServletRequest request) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream(READ_BUFFER_BYTES);
        try (ServletInputStream input = request.getInputStream()) {
            byte[] buffer = new byte[READ_BUFFER_BYTES];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read > SecurityBoundaryPolicy.MAX_REQUEST_BODY_BYTES - total) {
                    return null;
                }
                body.write(buffer, 0, read);
                total += read;
            }
        }
        return body.toByteArray();
    }

    private static void reject(HttpServletResponse response) {
        response.setStatus(PAYLOAD_TOO_LARGE);
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body.clone();
        }

        @Override
        public ServletInputStream getInputStream() {
            return new CachedBodyInputStream(body);
        }

        @Override
        public BufferedReader getReader() {
            Charset charset = getCharacterEncoding() == null
                    ? StandardCharsets.ISO_8859_1
                    : Charset.forName(getCharacterEncoding());
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }

    private static final class CachedBodyInputStream extends ServletInputStream {
        private final ByteArrayInputStream delegate;

        private CachedBodyInputStream(byte[] body) {
            delegate = new ByteArrayInputStream(body);
        }

        @Override
        public int read() {
            return delegate.read();
        }

        @Override
        public int read(byte[] bytes, int offset, int length) {
            return delegate.read(bytes, offset, length);
        }

        @Override
        public boolean isFinished() {
            return delegate.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            if (readListener == null) {
                throw new NullPointerException("readListener");
            }
            try {
                if (!isFinished()) {
                    readListener.onDataAvailable();
                }
                if (isFinished()) {
                    readListener.onAllDataRead();
                }
            } catch (IOException exception) {
                readListener.onError(exception);
            }
        }
    }
}
